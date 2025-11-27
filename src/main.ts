import { div, h2, html, p, span } from "./html"

const doc = div(
  {class: "document",
    style:{
      padding: "1em",
      width: "100%",
      "font-family": "sans-serif",
    }
  }
)
document.body.appendChild(doc)

function put(...el:HTMLElement[]){
  el.forEach(e => doc.append(e))
  return el
}

const blockSize = "40px";
const colors = ["var(--background-color)", "red", "green", "#0044FF", "var(--color)"]
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
      "background-color": "#111",
      border: "1px solid #888",
      "width": `calc(${blockSize} * 4)`
    }}, 
    Array.from(data).map(x => view_scalar(dtype, x))
  )
}


type Ast = {
  tag: "move" | "reduce" | "math" | "scalar" | "source"
  template : (i: number, src:string[]) => string | number
  srcs: Ast[]
}
const SRC: Ast = {tag: "source", template: () => "", srcs: []}
const scalar = (x: number) : Ast => ({tag: "scalar", template: () => x.toString(), srcs: []})


type Shaped = {
  tag: Ast["tag"],
  template: Ast["template"],
  offset: number,
  ismat: boolean,
  srcs: Shaped[],
  dst: number,
}

let mat_size = 16;


const compile = (buf: Ast) => {
  let ctx = new Map<Ast, number>();
  let lin : Shaped[] = [];

  let tmp_size = mat_size;
  const walk = (buf: Ast) : Shaped => {

    
    if (ctx.has(buf)) return lin[ctx.get(buf)]
    ctx.set(buf, -1);
    let srcs = buf.srcs.map(walk);

    ctx.set(buf, lin.length);
    
    let shaped: Shaped = {
      ...buf,
      ismat:
      buf.tag == "reduce" || buf.tag == "scalar" ? false : buf.tag == "source" || buf.tag == "move" ? true : srcs.some(b=>b.ismat),
      srcs,
      offset: buf.tag == "source" ? 0 : tmp_size,
      dst: 1
    }
    if (buf.tag == "source") tmp_size += 0;
    if (shaped.ismat) tmp_size += mat_size;
    else tmp_size += 1;
    lin.push(shaped);
    return shaped;
  }
  walk(buf);

  lin.map(x=>console.log(x))

  const code = lin.map((b, i)=> {
    let srcname = (i:number) => b.srcs.map(b=>`L[${b.offset + i}]`);
    let Loff = `L[${b.offset}]`;
    if (b.tag == "source") return "";
    if (b.tag == "scalar") return `${Loff} = ${b.template(0, [])};`;
    if (b.tag == "math") {
      if (b.ismat){
        let ret = "";
        for (let i = 0; i < mat_size; i++)  ret += `L[${b.offset + i}] = ${b.template(i, srcname(i))};\n`
        return ret;
      }
      return `${Loff} = ${b.template(0, srcname (0))};`;
    }

    if (b.tag == "move") {
      let ret = "//move\n";
      for (let i = 0; i < mat_size; i++) {
        let idx = Number(b.template(i, []));
        if (idx > 0 && idx < mat_size) ret += `L[${b.offset + i}] = L[${b.srcs[0].offset + idx}];\n`;
      }
      return ret;
    }
    if (b.tag == "reduce") {
      let ret = "";
      for (let j = 0; j < mat_size; j++) ret = b.template(j, [`L[${b.srcs[0].offset + j}]`, ret]) as string;
      return `${Loff} = ${ret};`
    }
  }).join("\n");

  const array = Int32Array.from({length: tmp_size}, (_, i) => 0);

  console.log(code);

  const func = new Function("L", code);

  return (x: Int32Array) => {
    array.set(x, 0);
    func(array);
    let last = lin[lin.length - 1];
    return Int32Array.from({length: last.ismat ? mat_size : 1}, (_, i) => array[last.offset + i ]);
  }
}

const math_ast = (template: (...src:string[]) => string) => (...srcs:Ast[]) : Ast =>  ({tag: "math", template : (_:number, src : string[]) => template(...src), srcs,})

const cast_scalar = (X: ScalarType, Y: ScalarType) => {
  if (X == Y || X == "boolean") return null;
  return (x: Ast) : Ast => {
    return math_ast((a) => {
      if (Y == "boolean") return `(${a} ? 1 : 0)`
      if (X == "number") {
        if (Y == "color") return `(${a} % 3)`
        if (Y == "block") return `(${a} * 3)`
      }
      if (X == "color") {
        if (Y == "number") return `(${a} % 3)`
        if (Y == "block") return `(${a} * 3)`
      }
      if (X == "block") {
        if (Y == "number") return `(${a} == 0 ? 0 : (${a}+2) / 3)`
        if (Y == "color") return `(${a} == 0 ? 0 : (${a}-1) % 3 + 1)`
      }
    })(x)
  }
}

type Fun =
{
  tag : "move"
  arity: 1,
  ast: (...srcs:Ast[]) => Ast
} | {
  tag : "math"
  expect: ScalarType
  result: ScalarType
  arity: number
  ast: (...srcs:Ast[]) => Ast
} | {
  tag : "const"
  arity: 0
  result: ScalarType
  ast: Ast    
}

const math = (arity: number,f: (... x: string[]) => string, ...T: ScalarType[]) : Fun => {
  if (T.length == 0) T = ["number"];
  if (T.length == 1) T = [T[0], T[0]];
  return {
    tag: "math",
    expect: T[0],
    result: T[1],
    arity,
    ast: math_ast(f)
  }
}

const reduce = (def: number, f: (p: string, acc: string) => string, T: ScalarType = "number") : Fun => {
  return {
    tag: "math",
    expect: T,
    result: T,
    arity: 1,
    ast: (...srcs) => ({
      tag: "reduce",
      template: (i: number, [p, acc]: string[]) => i == 0 ? def : f(p, acc),
      srcs
    })
  }
}

const move = (f: (i: number) => number) : Fun => {
  return {
    tag: "move",
    arity: 1,
    ast: (...srcs) => ({
      tag: "move",
      template: f,
      srcs
    })
  }
}

const src : Fun = { tag: "const", result: "block", arity: 0, ast: SRC }

const move_dir = (dx: number, dy: number) => move(i=>{
  let x = i % 4 + dx;
  let y = Math.floor(i / 4) + dy;
  if (x < 0 || x > 3 || y < 0 || y > 3) return -1;
  return x + y * 4;
})
const right = move_dir(1, 0)
const add = math(2, (a,b) => `(${a} + ${b})`, "number", "number", "number")
const not = math(1, (x) => `(!${x})`, "boolean")

const any = reduce(0, (x,y) => `${x} || ${y}`, "boolean")
const and = math(2, (x,y) => `${x} && ${y}`, "boolean")
const eq = math(2, (a,b) => `${a} == ${b}`,  "block", "boolean")

const get_color = math(1, x=>x, "color")

type Const = Fun & {tag: "const"}

const chain = (...fs: Fun[]) : Const =>{
  let go = () : Fun & {tag: "const"}=> {
    let f = fs.shift();
    if (f.arity == 0) return f as Fun & {tag: "const"}
    if (f == undefined) throw new Error("No function");
    if (f.tag == "move"){
      let {result, ast} = go();
      return {tag: "const",result: result,arity: 0,ast: f.ast(ast)}
    }
    let ast = f.ast as (...srcs:Ast[]) => Ast;
    let srcs = Array.from({length: f.arity}, go).map(s=> {
      let caster =  cast_scalar(s.result, (f as Fun & {expect: ScalarType}).expect)
      return caster ? caster(s.ast) : s.ast
    });
    
    let a = ast(...srcs);
    console.log(a)
    return {tag: "const",result: f.result,arity : 0,ast: a}
  }
  return go();
}


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

const cc = chain(not, any, and, get_color, src, eq, get_color, src, right, get_color, src)
const F = compile(cc.ast)

const view_rule = (F: (x: Int32Array) => Int32Array) => {

  fields.forEach(f => {

    put(view_matrix("block", f))
    let ret = F(f);
    if (ret.length == 1) return put(div({style: {border: "1px solid #888", width: blockSize}}, view_scalar(cc.result, ret[0])));
    put(view_matrix(cc.result, ret as Int32Array))
  })
}


const IT = 200000;
let st = performance.now();
for (let i = 0; i < IT; i++) {
  F(fields[i % fields.length])
}

let et = performance.now();
let dt = et - st;
console.log(`${Math.round(IT / dt)} k rules per second`);

view_rule(F)
