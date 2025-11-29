import { hash } from "crypto";
import { div, h2, html, p, show, span } from "./html"

const doc = div(
  {class: "document",
    style:{
      padding: "1em",
      width: "100%",
      "font-family": "sans-serif",
    }
  }
)

document.body.style.paddingBottom = "200px";

document.body.appendChild(doc)

function put(...el:HTMLElement[]){
  el.forEach(e => doc.append(e))
  return el
}

const blockSize = "40px";
const colors = ["var(--background)", "red", "green", "#0044FF", "var(--color)"]
type ScalarType = "block" | "color" | "number" | "boolean"


const view_scalar = (kind: ScalarType, num: number)=>{
  if (num == null) throw new Error("Null scalar");
  return div(
    {
      style:{
        ... (num != null ? {
          color: colors[kind == "block" ? (num == 0 ? 0 : (num-1) % 3 + 1) : kind == "boolean" ? 2 : 4],
          background: kind == "color" ? colors[num] : colors[0],
        }: {background: colors[0]}),
        width: blockSize, height: blockSize,
        "text-align": "center", "font-size": blockSize, "font-weight": "bold", },
    }, kind == "number" ? num : kind == "block" ? (num == 0 ? "" : Math.floor((num - 1) / 3)) : kind == "boolean" ? [num == 0 ? "" : "✓"] : "")
}

const view_matrix = (dtype: ScalarType, data: Int32Array) => {
    return div({style:{
      display: "flex",
      "flex-wrap": "wrap",
      "background": "#111",
      border: "1px solid #888",
      "width": `calc(${blockSize} * 4)`
    }}, 
    Array.from(data).map(x => view_scalar(dtype, x))
  )
}

let mat_size = 16;
const range = (i:number) => Array.from({length: i}, (_, k) => k);

type ALU = string; // template

type Source = {
  tag: "source"
  index: number
}

type ALUOp = {
  tag: "ALUOp"
  alu: ALU
  srcs: Atom[]
}

type Atom = Source | ALUOp;


type Tensor = {
  tag: "tensor"
  data: Atom[]
  type: ScalarType
}

type Fun = {
  tag: "alu"
  alu: ALU
  expect: ScalarType
  result: ScalarType
  arity: number
} | {
  tag: "reduce"
  alu: ALU
} | {
  tag: "move"
  move: (i: number) => number
} | Tensor


const SRC: Fun = {
  tag: "tensor",
  data: range(mat_size).map(i=> ({tag: "source", index: i})),
  type: "block"
}


const cast_scalar = (X: ScalarType, Y: ScalarType, t: Tensor): Tensor => {

  if (X == Y || X == "boolean") return t;

  let alu: string =
    Y == "boolean" ? "($0 ? 1 : 0)" :
    X == "number" ? (
      Y == "color" ? "($0 % 3)" :
      Y == "block" ? "($0 * 3)" :
      "ERR"
    ) :
    X == "color" ? (
      Y == "number" ? "($0 % 3)" :
      Y == "block" ? "($0 * 3)" :
      "ERR"
    ) :
    X == "block" ? (
      Y == "number" ? "($0 == 0 ? 0 : ($0+2) / 3 | 0)" :
      Y == "color" ? "($0 == 0 ? 0 : ($0-1) % 3 + 1)" :
      "ERR"
    ) :
    "ERR";

  return { tag: "tensor", type: Y, data: t.data.map(x=>({tag: "ALUOp", alu, srcs: [x]}))}
}


const alu = (srcs: Atom[], alu: string): Atom => ({tag: "ALUOp", alu, srcs})
const const_ = (x: number): Atom => ({tag: "ALUOp", alu: x.toString(), srcs: []})

const app = (f: Fun, x: Tensor[]) : Tensor => {
  if (f.tag == "tensor") return f
  let type = x[0].type;
  let data : Atom[] = [];

  if (f.tag == "alu"){
    // if (f.alu == "$0") return x[0];
    x = x.map(x => cast_scalar(x.type, f.expect, x))
    let mat = x.some(x=>x.data.length > 1)
    data = range(mat ? mat_size : 1).map(i=> ({tag: "ALUOp", alu: f.alu, srcs: x.map(x=>x.data[x.data.length > 1 ? i : 0])}))
    type = f.result;
  }
  if (f.tag == "reduce") data = [x[0].data.slice(1).reduce((acc,x)=> alu([acc, x], f.alu), x[0].data[0])]
  if (f.tag == "move") data = range(mat_size).map(f.move).map(i=> (i > 0 )? x[0].data[i] : const_(0))
  return {tag: "tensor", data, type}
}


const alufun = (arity: number, alu : string, ...T: ScalarType[]) : Fun => {
  if (T.length == 0) T = ["number"];
  if (T.length == 1) T = [T[0], T[0]];
  return {
    tag: "alu",
    alu,
    expect: T[0], result: T[1],
    arity
  }
}

const redfun = (alu: string) : Fun => ({tag: "reduce", alu})
const move = (move: (i: number) => number) : Fun => ({tag: "move", move})


const move_dir = (dx: number, dy: number) => move(i=>{
  let x = i % 4 + dx;
  let y = Math.floor(i / 4) + dy;
  if (x < 0 || x > 3 || y < 0 || y > 3) return -1;
  return x + y * 4;
})


const right = move_dir(1, 0)
const add = alufun(2, "($0 + $1)", "number", "number", "number")
const not = alufun(1, "(!$0)", "boolean")
const any = redfun("($0 || $1)")
const and = alufun(2, "($0 && $1)", "boolean")
const eq = alufun(2, "($0 == $1)", "block", "boolean")
const get_color = alufun(1, "$0", "color")


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

const compile = (rule: Fun[]) : [ScalarType, "matrix" | "scalar", (L: Int32Array) => Int32Array] => {
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
    if (usecount.get(atom) > 2) {
      let key = `x${seen.size}`;
      seen.set(atom, key);
      code += `${key} = ${c}; // ${usecount.get(atom)}\n`;
      return key;
    }
    return c;
  }

  let ret = t.data.map(raster).join(",\n");
  code = code + `return [${ret}];`;
  console.log(code)
  return [t.type, t.data.length == 1 ? "scalar" : "matrix", new Function("L", code) as (L: Int32Array) => Int32Array]
}


compile([add, SRC, SRC])



const view_rule = (X: Int32Array, rule: Fun[]) => {

  let [T, S, F] = compile(rule);
  let res = F(X);

  if (S == "scalar") put(div({style: {border: "1px solid #888", width: blockSize}}, view_scalar(T, res[0])));
  else put(view_matrix(T, res));
}


view_rule(Int32Array.from([0, 1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]), [add, SRC, SRC])



let n = 0;
let fields = [
  [
    n,n,n,n,
    n,n,1,n,
    n,1,n,n,
    n,n,n,n,
  ],
  [
    n,n,n,n,
    n,4,1,n,
    n,n,n,n,
    n,n,6,n,
  ],
  [
    n,n,n,n,
    n,14,n,n,
    1,2,n,n,
    n,n,n,n,
]].map(f => Int32Array.from(f))

const rule = [not, any, and, get_color, SRC, eq, get_color, SRC, right, get_color, SRC]

const [T, S, F] = compile(rule)


const IT = 200000;
let st = performance.now();
for (let i = 0; i < IT; i++) {
  F(fields[i % fields.length])
}

let et = performance.now();
let dt = et - st;
console.log(`${Math.round(IT / dt)} k rules per second`);

fields.forEach(f=>{
  let it = (view_matrix("block", f))
  put(it)
  view_rule(f, rule)
})



// fields.forEach(f=>{
//   let it = (view_matrix("block", f))
//   put(it)
//   view_rule(f, [
//     eq, src, get_color, src
//   ])
// })




