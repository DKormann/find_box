import { print } from "./html";

export let mat_size = 16;

export type DataType = "block" | "color" | "number" | "boolean"
export type TensorShape = "scalar" | "matrix"
export type TensorType = `${DataType}_${TensorShape}`
export const range = (i:number) => Array.from({length: i}, (_, k) => k);
export const randint = (min: number, max: number) => Math.floor(Math.random() * (max - min) + 0.99) + min
export const randchoice = <T>(arr: T[]) => arr[randint(0, arr.length-1)]

export type Atom = [string, ...Atom[]];
export type Tensor = [DataType, ...Atom[]]
export const data_type = ([dt, ..._]: Tensor): DataType => dt.split("_")[0] as DataType
export type Fun = ((...x:Tensor[]) => Tensor | null)
export const alusrc = (i: number) => [`L[${i}]`]
const atom = (op: string, ...srcs: Atom[]):Atom => [op, ...srcs]

const scalar = (x: number, type: DataType) : Fun => ()=> [type, [x.toString()]]
const aluunary = (alu: string, type: DataType): Fun => ([t,...a]: Tensor) => [type, atom(alu, ...a)]
const cast_scalar = (X: Tensor, T: DataType): Tensor | null => {
  if (X[0] == T) return X;
  if (T == "block") return null;
  if (T == "boolean") return aluunary("($0 ? 1 : 0)", "boolean")(X);
  if (X[0] == "number" && T == "color") return aluunary("($0 > 3 ? 4 : $0)", "color")(X);
  if (X[0] == "color" && T == "number") return aluunary("($0 == 0 ? 0 : ($0-1) % 3 + 1)", "number")(X);
  if (X[0] == "block" && T == "number") return aluunary("($0 == 0 ? 0 : (($0+2) / 3) | 0)", "number")(X);
  if (X[0] == "block" && T == "color") return aluunary("($0 == 0 ? 0 : ($0-1) % 3 + 1)", "color")(X);
}

const alubin = (alu: string, type: DataType | null): Fun => ([ta, ...a]:Tensor, [tb, ...b]:Tensor) => 
  [type || ta, ...range(Math.max(a.length, b.length)).map(i=> atom(alu, a[i % a.length], b[i % b.length]))]

const reduce = (alu: string, type: DataType): Fun => ([ta, ...a]:Tensor) => a.length != mat_size ? null :
  [type, a.slice(1).reduce((acc,x)=> atom(alu, acc, x), a[0])]

const move = (f: (i:number) => number) : Fun => ([ta, ...a]:Tensor) => a.length != mat_size ? null :
  [ta, ...range(mat_size).map(i=> f(i) == -1 ? atom("0") : a[i % a.length])]

const eq: Fun = (a:Tensor, b:Tensor) => data_type(a) != data_type(b) ? null : alubin("($0 == $1)", "boolean")(a, b)
const add: Fun = (a:Tensor, b:Tensor) => data_type(a) != "number" || data_type(b) != "number" ? null : alubin("($0 + $1)", "number")(a, b)
const and: Fun = (a:Tensor, b:Tensor) => alubin("($0 && $1)", "boolean")(cast_scalar(a, "boolean"), cast_scalar(b, "boolean"))
const sum: Fun = (a:Tensor) => data_type(a) != "number" ? null : reduce("($0 + $1)", "number")(a)
const any: Fun = (a:Tensor) => reduce("($0 || $1)", "boolean")(a)
const all: Fun = (a:Tensor) => reduce("($0 && $1)", "boolean")(a)

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
    if (x.some(x=>x == null)) throw new Error("Null argument");
    let r = f(...x);
    return r;
  }
  return go();
}

export const compile = (rule: Fun[]) : [DataType, "matrix" | "scalar", (L: Int32Array) => Int32Array] => {
  let [T, ...atoms] = chain(...rule);
  let usecount = new Map<string, number>();
  let count = ([op, ...a]: Atom) => {
    let key = JSON.stringify([op, ...a]);
    if (usecount.has(key)) return usecount.set(key, usecount.get(key) + 1);
    usecount.set(key, 1);
    a.forEach(count);
  }

  atoms.forEach(count);

  let code = "";
  let seen = new Map<string, string>();
  let raster = ([op, ...a]: Atom) => {
    let key = JSON.stringify([op, ...a]);
    if (seen.has(key)) return seen.get(key);
    let c = a.reduce((p, c, i) => p.replaceAll(`$${i}`, raster(c)), op);
    if (usecount.get(key) > 2) {
      let name = `x${seen.size}`;
      seen.set(key, name);
      code += `const ${name} = ${c};\n`;
      return key;
    }
    return c;
  }
  let ret = atoms.map(raster).join(",\n");
  code = code + `return [${ret}];`;
  return [T, atoms.length == 1 ? "scalar" : "matrix", new Function("L", code) as (L: Int32Array) => Int32Array]
}

const is_color = (x: number): Fun => (a:Tensor) => eq( cast_scalar(a, "color"), scalar(x, "color")())

export let Core : Record<string, Fun> = {
  number: (a:Tensor) => cast_scalar(a, "number"),
  color: (a:Tensor) => cast_scalar(a, "color"),
  isred: is_color(1),
  isgreen: is_color(2),
  isblue: is_color(3),
  any, all, sum,
  not: (a:Tensor) => data_type(a) != "boolean" ? null : aluunary("(!$0)", "boolean")(a),
  and, eq, add,
  "0": scalar(0, "number"),
  "1": scalar(1, "number"),
  "2": scalar(2, "number"),
  "3": scalar(3, "number"),
  x:() => ["block", ...range(mat_size).map(i=> atom(`L[${i}]`))]
}

const or = (a:Tensor, b:Tensor) => data_type(a) != "boolean" || data_type(b) != "boolean" ? null : alubin("($0 || $1)", "boolean")(a, b)
const right = move_dir(1, 0)
const up = move_dir(0, -1)
const left = move_dir(-1, 0)
const down = move_dir(0, 1)
export let Lang : Record<string, Fun> = {
  ...Core,
  right, up, left, down,
  next: (x:Tensor) => or(or(right(x), up(x)), or(left(x), down(x))),
  block: (num:Tensor, color:Tensor) => data_type(num) != "number" || data_type(color) != "color" ? null :
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
  bench()
}
