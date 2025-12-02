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

export type Fun
= { tag: "alu", reduce: boolean, alu: string, expect: ScalarType | null, result: ScalarType, arity: number}
| { tag: "move", move: (i: number) => number }
| Tensor


const SRC: Fun = {
  tag: "tensor",
  data: range(mat_size).map(i=> ({tag: "source", index: i})),
  type: "block"
}


const cast_scalar = (X: ScalarType, Y: ScalarType, t: Tensor): Tensor | null=> {

  if (X == Y || X == "boolean") return t;
  if (Y == "block") return null;

  let alu: string =
    Y == "boolean" ? "($0 ? 1 : 0)" :
    X == "number" ? (
      Y == "color" ? "$0 > 3 ? 4 : $0" :
      "ERR"
    ) :
    X == "color" ? (
      Y == "number" ? "$0" :
      "ERR"
    ) :
    X == "block" ? (
      Y == "number" ? "($0 == 0 ? 0 : (($0+2) / 3) | 0)" :
      Y == "color" ? "($0 == 0 ? 0 : ($0-1) % 3 + 1)" :
      "ERR"
    ) :
    "ERR";

  return { tag: "tensor", type: Y, data: t.data.map(x=>({tag: "ALUOp", alu, srcs: [x]}))}
}


const alu = (srcs: Atom[], alu: string): Atom => ({tag: "ALUOp", alu, srcs})
const const_ = (x: number): Atom => ({tag: "ALUOp", alu: x.toString(), srcs: []})


const scalar = (x: number, type: ScalarType): Tensor => ({tag: "tensor", type, data: [const_(x)]})

let app = (f: Fun, x: Tensor[]) : Tensor => {
  if (f.tag == "tensor") return f
  let type = x[0].type;
  let data : Atom[] = [];

  if (f.tag == "alu"){
    let expect = f.expect == null ? [...x.filter(x=>x.type != "block"),{type:"block"} ][0].type as ScalarType : f.expect;
    x = x.map(x => cast_scalar(x.type, expect, x))
    if (f.alu == "$0") return x[0];
    let mat = x.some(x=>x.data.length > 2)
    if (f.reduce) data = [x[0].data.slice(1).reduce((acc,x)=> alu([acc, x], f.alu), x[0].data[0])]
    else data = range(mat ? mat_size : 1).map(i=> ({tag: "ALUOp", alu: f.alu, srcs: x.map(x=>x.data[x.data.length > 1 ? i : 0])}))
    type = f.result;
  }
  if (f.tag == "move") data = range(mat_size).map(f.move).map(i=> (i > 0 )? x[0].data[i] : const_(0))
  return {tag: "tensor", data, type}
}


const alufun = (arity: number, alu : string, ...T: ScalarType[]) : Fun => {
  if (T.length == 0) T = ["number"];
  if (T.length == 1) T = [T[0], T[0]];
  return {
    tag: "alu",
    reduce: false,
    alu,
    expect: T[0], result: T[1],
    arity
  }
}

const redfun = (alu: string, result: ScalarType) : Fun => ({tag: "alu", reduce: true, alu, expect: result, result, arity: 1})


export const arity = (f: Fun) => f.tag == "alu" ? f.arity : f.tag == "tensor" ? 0 : 1;

const move_dir = (dx: number, dy: number) : Fun => ({tag: "move", move: ((i:number)=>{
  let x = i % 4 + dx;
  let y = Math.floor(i / 4) + dy;
  if (x < 0 || x > 3 || y < 0 || y > 3) return -1;
  return x + y * 4;
})})



const chain = (...fs: Fun[]) : Tensor => {
  let go = () : Tensor => {
    let f = fs.shift();
    if (f.tag == "tensor") return f;
    if (f == undefined) throw new Error("No function");
    let arity = f.tag == "alu" ? f.arity : 1;
    let x = range(arity).map(_ => go());
    return app(f, x);
  }
  return go();
}

export const compile = (rule: Fun[]) : [ScalarType, "matrix" | "scalar", (L: Int32Array) => Int32Array] => {
  let t = chain(...rule);

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


const is_color = (x: number): Fun => alufun(1, `($0 == ${x})`, "color", "boolean")


export let Core : Record<string, Fun> = {

  number: alufun(1, "$0", "number"),
  isred: is_color(1),
  isgreen: is_color(2),
  isblue: is_color(3),
  any: redfun("($0 || $1)", "boolean"),
  sum: redfun("($0 + $1)", "number"),
  not: alufun(1, "(!$0)", "boolean"),
  
  and: alufun(2, "($0 && $1)", "boolean"),
  eq: alufun(2, "($0 == $1)", null, "boolean"),
  add: alufun(2, "($0 + $1)", "number", "number"),

  "0": scalar(0, "number"),
  "1": scalar(1, "number"),
  "2": scalar(2, "number"),
  "3": scalar(3, "number"),
  x: SRC,
}


export let Lang : Record<string, Fun> = {
  ...Core,

  right: move_dir(1, 0),
  up: move_dir(0, -1),


  left: move_dir(-1, 0),
  down: move_dir(0, 1),

  color: alufun(1, "$0", "color"),
  block: alufun(2, "$0 == 0 ? 0 : ($0*3)-2 + $1 -1", "number", "block"),
  asblock: alufun(1, "$0" , "block"),
  all: redfun("($0 && $1)", "boolean"),
  product: redfun("($0 * $1 | 0)", "number"),
  or: alufun(2, "($0 || $1)", "boolean"),
  mul: alufun(2, "$0 * $1", "number", "number"),
  red : scalar(1, "color"),
  green : scalar(2, "color"),
  blue : scalar(3, "color"),
}


{

  let fields = range(10).map(_=>Int32Array.from(range(mat_size).map(_=>randint(0,9))))

  const rule = "not any and color x eq color x right color x".split(" ").map(c=>Lang[c])
  const [T, S, F] = compile(rule)

  const bench = ()=>{

    const IT = 200000;

    let st = performance.now();
    for (let i = 0; i < IT; i++) {
      F(fields[i % fields.length])
    }
    
    
    let et = performance.now();
    let dt = et - st;
    print(`${Math.round(IT / dt)} k rules per second`);
  }
  // bench()
}