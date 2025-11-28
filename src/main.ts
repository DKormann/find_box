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

let mat_size = 16;
const range = (i:number) => Array.from({length: i}, (_, k) => k);
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
        if (Y == "number") return `(${a} == 0 ? 0 : (${a}+2) / 3 | 0)`
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
    return {tag: "const",result: f.result,arity : 0,ast: a}
  }
  return go();
}


const raster = (x: Ast) => {

  let ctx = new Map<Ast, number>();
  let lin : {ast:Ast, ismat: boolean} [] = []

  const walk = (ast: Ast) : boolean => {
    if (ctx.has(ast)) return lin[ctx.get(ast)].ismat;
    let matin = ast.srcs.map(walk).some(x=>x);
    let ismat = (ast.tag == "reduce" || ast.tag == "scalar") ? false : ast.tag == "source" ? true : matin;
    ctx.set(ast, lin.length);
    lin.push({ast, ismat});
    return ismat;
  }
  let ismat = walk(x);

  type key = number;
  type CacheEntry = {
    template: (srcs: string[]) => string
    srcs: key[]
    uses: number
  }
  const cache = new Map<key, CacheEntry> ();
  const go = (ast: Ast, i: number) : key => {
    if (! lin[ctx.get(ast)].ismat) i = 0;
    let key = ctx.get(ast) * 100 + i;
    if (cache.has(key)) {
      cache.get(key).uses ++;
      return key;
    }

    let template: (i: number, src: string[]) => string | number = ast.template;
    let srcs: key[] = [];
    if (ast.tag == "math") srcs = ast.srcs.map(s=>go(s, i));
    if (ast.tag == "reduce") {
      srcs = range(mat_size).map(i => go(ast.srcs[0], i));
      template = (_, src) => src.reduce((a,b,i) => ast.template(i, [a,b]) as string, "");
    }
    if (ast.tag == "move") {
      let j  = ast.template(i, []) as number;
      if (j > 0 && j < mat_size) return go(ast.srcs[0], j);
      template = () => "0";
    }
    if (ast.tag == "source") template = () => `L[${i}]`;
    let res : CacheEntry = {template: (s) => template(0,s) as string , srcs, uses: 1};
    cache.set(key, res);

    srcs.forEach(k=>{
      if (res.template(srcs.map(k=> `$${k}$`)).split(`$${k}$`).length - 1 > 1) cache.get(k).uses ++;
    })
    return key;
  }

  let ret = ismat ? range(mat_size).map(i=>go(x, i)) : [go(x, 0)]
  let code = "";
  let vars = new Set<number>();

  const render = (key: number) =>{

    if (vars.has(key)) return `x${key}`;

    let entry = cache.get(key);
    let c = entry.template(entry.srcs.map(k=> render(k)));

    if (entry.uses > 1) {
      if (!vars.has(key)) code += `x${key} = ${c};\n`;
      vars.add(key);
      return `x${key}`;
    }
    return `(${c})`;
  }

  Array.from(cache.entries()).sort((a,b) => a[0] - b[0]).forEach(([key, value]) => render(key));
  code += `return [${ret.map(k=> render(k)).join(",\n")}];`
  return code;
}

const compile = (rule: Fun[]) : [ScalarType, (L: Int32Array) => Int32Array] => {
  let cc = chain(...rule);
  let code = raster(cc.ast);
  console.log(code)
  return [cc.result, new Function("L", code) as (L: Int32Array) => Int32Array];
}

const view_rule = (X: Int32Array, rule: Fun[]) => {

  let [T, F] = compile(rule);
  let res = F(X);

  if (res.length == 1) put(div({style: {border: "1px solid #888", width: blockSize}}, view_scalar(T, res[0])));
  else put(view_matrix(T, res));
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
  let it = (view_matrix("block", f))
  put(it)
  view_rule(f, rule)
})



fields.forEach(f=>{
  let it = (view_matrix("block", f))
  put(it)
  view_rule(f, [
    right, right, get_color, src
  ])
})




