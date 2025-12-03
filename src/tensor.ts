import { print, repr, style } from "./html";

export let mat_size = 16;

export type DataType = "block" | "color" | "number" | "boolean"
export type ShapeType = "scalar" | "matrix"
export type TensorType = `${DataType}_${ShapeType}`
export const range = (i:number) => Array.from({length: i}, (_, k) => k);
export const randint = (min: number, max: number) => Math.floor(Math.random() * (max - min) + 0.99) + min
export const randchoice = <T>(arr: T[]) => arr[randint(0, arr.length-1)]

export type Atom = [string, ...Atom[]];
export type Buffer = [TensorType, ...Atom[]]
export const dtype = ([dt, ..._]: Buffer): DataType => dt.split("_")[0] as DataType
export const shape = ([dt, ..._]: Buffer): ShapeType => dt.split("_")[1] as ShapeType
export type Fun = ((...x:Buffer[]) => Buffer | null)
const atom = (op: string, ...srcs: Atom[]):Atom => [op, ...srcs]
  

const fun = (alu: string, type: DataType | null, ...srcs: Buffer[]): Buffer =>{
  if (srcs.some(s=>s == null)) return null;
  let shp : ShapeType = srcs.some(s=>shape(s) == "matrix") ? "matrix" : "scalar";
  return [`${type}_${shp}`,...range(shp == "matrix" ? mat_size : 1).map(i=>atom(alu, ...srcs.map(([_,...at])=>at[i % at.length] as Atom)))]
}

const reduce = (def: Atom, alu: string, type: DataType, x: Buffer): Buffer =>{

  if (x == null || shape(x) == "scalar") return null;
  let [dt, ...a] = x;
  return [`${type}_scalar`, a.reduce((acc,x)=> atom(alu, acc, x), def)]
}


const move = (dx: number, dy: number) : Fun => ([dt, ...a]:Buffer) => {
  return shape([dt]) == "scalar" ? null :[dt,
    ...range(mat_size).map(i=>{
      let [x,y] = [i%4 + dx, Math.floor(i/4) + dy];
      return (x < 0 || x >= 4 || y < 0 || y >= 4) ? -1 : (x + y*4);
    }).map(i => i == -1 ? atom("0") : a[i])
  ]}


const cast = (X: Buffer, T: DataType): Buffer | null =>
  X == null ? null :
  (dtype(X) == T) ? X:
  (T == "block") ? null:
  (T == "boolean") ? fun("($0 ? 1 : 0)", "boolean", X):
  (dtype(X) == "number" && T == "color") ? fun("($0 > 3 ? 4 : $0)", "color", X):
  (dtype(X) == "color" && T == "number") ? fun("($0 == 0 ? 0 : ($0-1) % 3 + 1)", "number", X):
  (dtype(X) == "block" && T == "number") ? fun("($0 == 0 ? 0 : (($0+2) / 3) | 0)", "number", X):
  (dtype(X) == "block" && T == "color") ? fun("($0 == 0 ? 0 : ($0-1) % 3 + 1)", "color", X):
  null;


const eq: Fun = (a:Buffer, b:Buffer) => a == null || b == null || dtype(a) != dtype(b) ? null : fun("($0 == $1)", "boolean", a, b)
const add: Fun = (a:Buffer, b:Buffer) => dtype(a) == "color" || dtype(b) == "color" ? null : fun("($0 + $1)", "number", cast(a, "number"), cast(b, "number"))
const mul: Fun = (a:Buffer, b:Buffer) => dtype(a) == "color" || dtype(b) == "color" ? null : fun("($0 * $1)", "number", cast(a, "number"), cast(b, "number"))
const and: Fun = (a:Buffer, b:Buffer) => fun("($0 && $1)", "boolean", cast(a, "boolean"), cast(b, "boolean"))
const or = (a:Buffer, b:Buffer) => fun("($0 || $1)", "boolean", cast(a, "boolean"), cast(b, "boolean"))

const eq_poly: Fun = (a:Buffer, b:Buffer) => fun(dtype(a) != dtype(b) ? "0" : "($0 == $1)", "boolean", a, b)
const sum: Fun = (a:Buffer) => dtype(a) == "color" ? null : reduce(atom("0"), "($0 + $1)", "number", cast(a, "number"))
const any: Fun = (a:Buffer) => reduce(atom("0"), "($0 || $1)", "boolean", cast(a, "boolean"))
const all: Fun = (a:Buffer) => reduce(atom("1"), "($0 && $1)", "boolean", cast(a, "boolean"))


const chain = (...fs: Fun[]) : Buffer => {
  let go = () : Buffer =>{
    let f = fs.shift();
    if (f == undefined) throw new Error("No function");
    if (f.length == 0) return f();
    let x = range(f.length).map(_ => go());
    if (x.some(x=>x == null)) throw new Error("Null argument");
    let r = f(...x);
    if (r == null) print("null result", f, x)
    return r;
  }
  return go();
}

export const compile = (rule: Fun[]) : [TensorType, (L: Int32Array) => Int32Array] => {
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
      return name;
    }
    return c;
  }
  let ret = atoms.map(raster).join(",\n");
  code = code + `return [${ret}];`;
  return [T, new Function("L", code) as (L: Int32Array) => Int32Array]
}

const is_color = (x: number): Fun => (a:Buffer) =>  eq( a, ["color_scalar", atom(x.toString())])




const right = move(1, 0)
const up = move(0, -1)
const left = move(-1, 0)
const down = move(0, 1)

export let Core : Record<string, Fun> = {
  number: (a:Buffer) => dtype(a) == "number" ? null : cast(a, "number"),
  color: (a:Buffer) => dtype(a) == "color" ? null : cast(a, "color"),
  right, up, left, down,
  isred: is_color(1),
  isgreen: is_color(2),
  isblue: is_color(3),
  any, all, sum,
  not: (a:Buffer) => dtype(a) != "boolean" ? null : fun("(!$0)", "boolean", a),
  and, or, eq, add, mul,
  "0": ()=>["number_scalar", atom("0")],
  "1": ()=>["number_scalar", atom("1")],
  "2": ()=>["number_scalar", atom("2")],
  "3": ()=>["number_scalar", atom("3")],
  x:() => ["block_matrix", ...range(mat_size).map(i=> atom(`L[${i}]`))]
}

export let Lang : Record<string, Fun> = {
  _eq: eq_poly,
  ...Core,
  next: (x:Buffer) => or(or(right(x), up(x)), or(left(x), down(x))),
  block: (num:Buffer, color:Buffer) => dtype(num) != "number" || dtype(color) != "color" ? null : fun("($0 == 0 ? 0 : ($0*3)-2 + $1 -1)", "block", num, color),
  red : ()=>["color_scalar", ["1"]],
  green : ()=>["color_scalar", ["2"]],
  blue : ()=>["color_scalar", ["3"]],
}

{
  let fields = range(10).map(_=>Int32Array.from(range(mat_size).map(_=>randint(0,9))))
  const [T, F] = compile("not any and color x eq color x right color x".split(" ").map(c=>Lang[c]))
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

export const permute = <T,S>(T: T[], S: S[]): [T, S][] => T.map((t:T)=>S.map((s:S)=>[t, s] as [T, S])).flat();

export const tensortypes = permute(["number", "color", "boolean", "block"], ["scalar", "matrix"]).map(([t, s])=>`${t}_${s}`) as TensorType[];


export const check = (rule: (Fun | "*")[]): TensorType[]=>{
  const go = (): TensorType[] => {
    let f = rule.shift();
    if (f == undefined) return tensortypes;
    if (f == "*") return tensortypes;
    if (f.length == 0) return [(f())[0]];
    let res : TensorType[];
    if (f.length == 1) res =
      go().map((t:TensorType)=> f([t]))
      .filter(r=>r != null)
      .map(r=>r[0]);
    if (f.length == 2){
      let [t1, t2] = [go(), go()];
      res = t1.map(t1=>t2.map(t2=> f([t1], [t2])).filter(r=>r != null).map(r=>r[0])).flat()
    }
    return Array.from(new Set(res));
  }
  return go();
}

print("check:",check("sum blue".split(" ").map(c=>c == "*" ? "*" : Lang[c])))

