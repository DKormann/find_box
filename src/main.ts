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


type Ast = {
  tag: "move" | "reduce" | "math" | "scalar" | "source"
  template : (i: number, src:string[]) => string | number
  srcs: Ast[]
}
const SRC: Ast = {tag: "source", template: () => "", srcs: []}
const scalar = (x: number) : Ast => ({tag: "scalar", template: ()=> x, srcs: []})


type Shaped = {
  tag: Ast["tag"],
  template: Ast["template"],
  ismat: boolean,
  srcs: Shaped[],
  dst: number,
}

let mat_size = 16;


const range = (i:number) => Array.from({length: i}, (_, k) => k);



const math_ast = (template: (...src:string[]) => string) => (...srcs:Ast[]) : Ast =>  ({tag: "math", template : (_:number, src : string[]) => template(...src), srcs,})

{
  const adder = math_ast((a,b) => `(${a} + ${b})`)
  show(adder(scalar(1), SRC));
}



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

type Fun = {
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
    expect: T[0], result: T[1],
    arity, ast: math_ast(f)
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
const const_ = (x: number): Fun => ({tag: "const", result: "number", arity: 0, ast: scalar(x)})
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




const compile = (rule: Fun[]) : [ScalarType, (field: Int32Array) => Int32Array] => {

  let cc = chain(...rule);

  let seen = new Map<Ast, number>();
  let lin : Shaped[] = [];

  const walk = (buf: Ast) : Shaped => {

    if (seen.has(buf)){
      let res = lin[seen.get(buf)];
      res.dst ++ ;
      return res;
    }
    seen.set(buf, 1);
    let srcs = buf.srcs.map(walk);
    seen.set(buf, lin.length);
  
    
    let shaped: Shaped = {
      ...buf,
      ismat:
      buf.tag == "reduce" || buf.tag == "scalar" ? false : buf.tag == "source" || buf.tag == "move" ? true : srcs.some(b=>b.ismat),
      srcs,
      dst: 1,
    }

    lin.push(shaped);
    return shaped;
  }

  walk(cc.ast);

  const code = lin.map((b, k)=> {

    let get_name = (buf: Shaped = b, i:number = 0) => `X_${lin.indexOf(buf)}_${i}`;
    let srcname = (i:number) => b.srcs.map(b=> get_name(b, i));
    
    let ret = "";
    if (b.tag == "source") {
      for (let i = 0; i < mat_size; i++) ret += `${get_name(b, i)} = L[${i}];\n`;
    }
    if (b.tag == "scalar") ret = `${get_name()} = ${b.template(0, [])};`;
    if (b.tag == "math") {
      if (b.ismat)
        for (let i = 0; i < mat_size; i++)  ret += `${get_name(b, i)} = ${b.template(i, srcname(i))};\n`
      else ret = `${get_name()} = ${b.template(0, srcname (0))};`;
    }

    if (b.tag == "move") {
      ret = "//move\n";
      for (let i = 0; i < mat_size; i++) {
        let idx = Number(b.template(i, []));
        if (idx > 0 && idx < mat_size) ret += `let ${get_name(b,i)} = ${get_name(b.srcs[0], idx)};\n`;
        else ret += `let ${get_name(b,i)} = 0;\n`;
      }
    }
    if (b.tag == "reduce") {
      for (let j = 0; j < mat_size; j++) ret = b.template(j, [get_name(b.srcs[0], j), ret]) as string;
      ret = `${get_name()} = ${ret};`
    }
    return ret;
  }).join("\n") + `\nreturn [${range(lin[lin.length-1].ismat? 16 : 1).map((i) => `X_${lin.length - 2}_${i}`).join(", ")}];`;

  console.log(code);


  const func = new Function("L", code) as (L: Int32Array) => Int32Array;
  return [cc.result, func];
}




const view_rule = (X: Int32Array, rule: Fun[]) => {


  let [T, F] = compile(rule);
  let res = F(X);

  if (res.length == 1) put(div({style: {border: "1px solid #888", width: blockSize}}, view_scalar(T, res[0])));
  else put(view_matrix(T, res));
}

{

  let ast = [add, const_(1), src]

  show(ast)

  show(chain(...ast))

  let [T, F] = compile(ast)

  show(F(Int32Array.from([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16])))


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

const rule = [not, any, and, get_color, src, eq, get_color, src, right, get_color, src]
const [T, F] = compile(rule)


const IT = 200000;
let st = performance.now();
for (let i = 0; i < IT; i++) {
  F(fields[i % fields.length])
}

let et = performance.now();
let dt = et - st;
console.log(`${Math.round(IT / dt)} k rules per second`);

fields.forEach(f=>{
  console.log(f)
  let it = (view_matrix("block", f))
  put(it)
  view_rule(f, rule)
})


