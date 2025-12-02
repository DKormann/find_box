import { print } from "./html";

let mat_size = 16;

export type ScalarType = "block" | "color" | "number" | "boolean"
export const range = (i:number) => Array.from({length: i}, (_, k) => k);
export const randint = (min: number, max: number) => Math.floor(Math.random() * (max - min) + 0.99) + min
export const randchoice = <T>(arr: T[]) => arr[randint(0, arr.length-1)]

type Atom = { tag: "source", index: number } | { tag: "ALUOp", alu: string, srcs: Atom[] };

type Tensor = {
  tag: "tensor"
  data: Atom[]
  type: ScalarType
}

export type Fun = ((...x:Tensor[]) => Tensor | null)

const mkalu = (alu: string, srcs: Atom[]): Atom => ({tag: "ALUOp", alu, srcs})
const tensor = (data: Atom[], type: ScalarType): Tensor => ({tag: "tensor", data, type})

const scalar = (x: number, type: ScalarType) : Fun => ()=> tensor([mkalu(x.toString(), [])], type)
const aluunary = (alu: string, type: ScalarType): Fun => (a:Tensor) => a.type != type ? null : tensor([mkalu(alu, [a.data[0]])], type)

const cast_scalar = (X: Tensor, T: ScalarType): Tensor | null => {
  if (X.type == T) return X;
  if (T == "block") return null;
  if (T == "boolean") return aluunary("($0 ? 1 : 0)", "boolean")(X);
  if (X.type == "number" && T == "color") return aluunary("($0 > 3 ? 4 : $0)", "color")(X);
  if (X.type == "color" && T == "number") return aluunary("($0 == 0 ? 0 : ($0-1) % 3 + 1)", "number")(X);
  if (X.type == "block" && T == "number") return aluunary("($0 == 0 ? 0 : (($0+2) / 3) | 0)", "number")(X);
  if (X.type == "block" && T == "color") return aluunary("($0 == 0 ? 0 : ($0-1) % 3 + 1)", "color")(X);
}

const alubin = (alu: string, type: ScalarType | null): Fun => (a:Tensor, b:Tensor) => 
  tensor(range(Math.max(a.data.length, b.data.length)).map(i=>(mkalu(alu, [a.data[i % a.data.length], b.data[i % b.data.length]]))), type || a.type)

const reduce = (alu: string, type: ScalarType): Fun => (a:Tensor) => a.data.length != mat_size ? null :
  tensor([a.data.slice(1).reduce((acc,x)=> mkalu(alu, [acc, x]), a.data[0])], type)




const move = (f: (i:number) => number) : Fun => (a:Tensor) => a.data.length != mat_size ? null :
  tensor(range(mat_size).map(i=> f(i) == -1 ? mkalu("0", []) : a.data[i]), a.type)

const eq: Fun = (a:Tensor, b:Tensor) => a.type != b.type ? null : alubin("($0 == $1)", "boolean")(a, b)
const add: Fun = (a:Tensor, b:Tensor) => a.type != "number" || b.type != "number" ? null : alubin("($0 + $1)", "number")(a, b)
const and: Fun = (a:Tensor, b:Tensor) => a.type != "boolean" || b.type != "boolean" ? null : alubin("($0 && $1)", "boolean")(a, b)
const sum: Fun = (a:Tensor) => a.type != "number" ? null : reduce("($0 + $1)", "number")(a)
const any: Fun = (a:Tensor) => reduce("($0 || $1)", "boolean")(a)

const move_dir = (dx: number, dy: number) : Fun => (a:Tensor) => move((i:number)=>{
  let check = (x:number)=> x>=0 && x<4;
  i += dx + dy*4;
  return (check(i%4) && check(Math.floor(i/4))) ? i : -1;
})(a)


const chain = (...fs: Fun[]) : Tensor => {
  let go = () : Tensor =>{
    let f = fs.shift();
    if (f == undefined) throw new Error("No function");
    if (f.length == 0) return f();
    let x = range(f.length).map(_ => go());
    return f(...x);
  }

  print("chain", fs.map(f=>f.length));
  return go();
}

export const compile = (rule: Fun[]) : [ScalarType, "matrix" | "scalar", (L: Int32Array) => Int32Array] => {

  print("compile", rule.map(f=>f.length));
  let t = chain(...rule);

  print(t)

  let lin: Atom[] = [];
  let smap = new Map<string, number>();
  let dedup = (a: Atom) : Atom => {
    let key = "";
    if (a.tag == "source") key = `s${a.index}`;
    else{
      a.srcs = a.srcs.map(dedup)
      key = `${a.alu}(${a.srcs.map(x=>lin.indexOf(x)).join(",")})`
    }
    if (smap.has(key)) return lin[smap.get(key)];
    smap.set(key, lin.length);
    lin.push(a);
    return a;
  }

  t.data.forEach(dedup);
  let usecount = new Map<Atom, number>();
  let count = (atom: Atom) => {
    if (atom.tag == "ALUOp") atom.srcs.forEach(count);
    usecount.set(atom, (usecount.get(atom) || 0) + 1);
  }

  t.data.forEach(count);
  let code = "";
  let seen = new Map<Atom, string>();
  let raster = (atom: Atom) => {
    if (seen.has(atom)) return seen.get(atom);
    let c = atom.tag == "source" ? `L[${atom.index}]` : atom.srcs.reduce((p, c, i) => p.replaceAll(`$${i}`, raster(c)), atom.alu);
    if (usecount.get(atom) > 0) {
      let key = `x${seen.size}`;
      seen.set(atom, key);
      code += `const ${key} = ${c};\n`;
      return key;
    }
    return c;
  }
  let ret = t.data.map(raster).join(",\n");
  code = code + `return [${ret}];`;
  return [t.type, t.data.length == 1 ? "scalar" : "matrix", new Function("L", code) as (L: Int32Array) => Int32Array]
}

const is_color = (x: number): Fun => (a:Tensor) => eq( cast_scalar(a, "color"), scalar(x, "color")())

export let Core : Record<string, Fun> = {

  number: (a:Tensor) => cast_scalar(a, "number"),
  color: (a:Tensor) => cast_scalar(a, "color"),
  isred: is_color(1),
  isgreen: is_color(2),
  isblue: is_color(3),
  any, sum,
  not: (a:Tensor) => a.type != "boolean" ? null : aluunary("(!$0)", "boolean")(a),
  and, eq, add,
  "0": scalar(0, "number"),
  "1": scalar(1, "number"),
  "2": scalar(2, "number"),
  "3": scalar(3, "number"),
  x:() => tensor(range(mat_size).map(i=> ({tag: "source", index: i})), "block"),
}

const or = (a:Tensor, b:Tensor) => a.type != "boolean" || b.type != "boolean" ? null : alubin("($0 || $1)", "boolean")(a, b)
const right = move_dir(1, 0)
const up = move_dir(0, -1)
const left = move_dir(-1, 0)
const down = move_dir(0, 1)
export let Lang : Record<string, Fun> = {
  ...Core,
  right, up, left, down,
  next: (x:Tensor) => or(or(right(x), up(x)), or(left(x), down(x))),
  block: (num:Tensor, color:Tensor) => (num.type != "number" || color.type != "color") ? null :
    alubin("($0 == 0 ? 0 : ($0*3)-2 + $1 -1)", "block")(num, color),
  red : scalar(1, "color"),
  green : scalar(2, "color"),
  blue : scalar(3, "color"),
}

{

  let fields = range(10).map(_=>Int32Array.from(range(mat_size).map(_=>randint(0,9))))
  const [T, S, F] = compile("not any and color x eq color x right color x".split(" ").map(c=>Lang[c]))
  const bench = ()=>{
    const IT = 200000;
    let st = performance.now();
    for (let i = 0; i < IT; i++) F(fields[i % fields.length])    
    let et = performance.now();
    let dt = et - st;
    print(`${Math.round(IT / dt)} k rules per second`);
  }
  // bench()
}