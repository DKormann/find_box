import { div, h2, html, p, span } from "./html"
export {}

const doc = div(
  {class: "document",
    style:{
      padding: "1em",
      width: "100v%",
      "font-family": "sans-serif",
    }
  }
)

document.body.appendChild(doc)


function put(...el:HTMLElement[]){
  el.forEach(e => doc.append(e))
  return el
}

function log(...el:(string | Object) []){
  put (p(
    {style: {"font-family": "monospace"}},
    el.map(e => span((typeof e == "string" ? e : JSON.stringify(e)) + " "))
  ))
  return el
}

const blockSize = "40px";
const colors = ["red", "green", "#0044FF", "black", "white"]
type Color = 0 | 1 | 2
type ScalarType = "block" | "color" | "number" | "boolean"


type Kind = ScalarType | ["matrix", ScalarType]


type Raw = number | (number | null) []

type Runner = (x: Raw[]) => Raw

type Fun =
{
  tag: "source"
  kind: Kind,
} | {
  tag: "const",
  kind: Kind,
  content: Raw
} | {
  tag: "binary",
  expect: [ScalarType, ScalarType]
  result: ScalarType,
  runner: (x: number, y: number) => number
} | {
  tag: "reduce",
  expect: ScalarType
  result: ScalarType
  runner: [number, (x: number, y: number) => number]
} | {
  tag: "move",
  index : (i: number) => number,
}

const mapnull = <T,R> (x: T | null, f: (x: T) => R): R | null => {
  if (x == null) return null;
  return f(x);
}

const cast : Record<ScalarType, Record<ScalarType, (x: number) => number>> = {
  block: {
    number: x => Math.floor(x / 3),
    color: x => x % 3,
    boolean: x=> Math.floor(x / 3) == 0 ? 0 : 1,
    block: x=>x,
  },
  color: {
    number: x => x,
    block: x => x,
    boolean: x=> x == 0 ? 0 : 1,
    color: x=>x,
  },
  number: {
    block: x => x * 3,
    color: x => x % 3,
    boolean: x=>x == 0 ? 0 : 1,
    number: x=>x,
  },
  boolean: {
    number: x=>x,
    block: x=>x,
    color: x=>x,
    boolean: x=>x,
  }
}

const view_scalar = (kind: ScalarType, num: number)=>{
  return div(
    {
      onclick: () =>{
        console.log(kind, num)
      },

      style:{
        ... (num != null ? {
          color: colors[kind == "block" ? cast.block.color(num) : kind == "boolean" ? num : 4],
          background: kind == "color" ? colors[num] : colors[3],
        }: {background: colors[3]}),
        width: blockSize, height: blockSize,
        "text-align": "center", "font-size": blockSize, "font-weight": "bold", },
    }, num == null ? "" : kind == "number" ? num : kind == "block" ? cast.block.number(num) : kind == "boolean" ? [num == 0 ? "✗" : "✓"] : "")
}

const view_matrix = (dtype: ScalarType, data: number[]) => {
    return div({style:{
      display: "flex",
      "flex-wrap": "wrap",
      "background-color": "#111",
      border: "1px solid #888",
      "width": `calc(${blockSize} * 4)`
    }}, 
    (data as (number | null)[]).map(x => view_scalar(dtype, x))
  )
}
const range = (n: number) => Array.from({length: n}, (_, i) => i);
const zeros = (n: number) => Array.from({length: n}, () => 0);






const ismat = (k: Kind) => k instanceof Array;

const judge = (...fs: Fun[]): "mat" | "scalar" | "err" | "unk" =>{

  const take = () => fs.shift();
  
  let go = (): "mat" | "scalar" | "err" | "unk" => {

    let f = take();
    if (f === undefined) return "unk";

    if (f.tag == "const") return ismat(f.kind) ? "mat" : "scalar";

    let x = go();
    if (x == "err") return x

    if (f.tag == "reduce"){
      if (x == "scalar") return "err";
      return x;
    }

    if (f.tag == "move"){
      if (x == "scalar") return "err";
      if (x == "mat") return "scalar";
      return x;
    }

    if (f.tag == "binary"){
      let y = go();
      if (y == "err") return y
      if (y == "mat" || x == "mat") return "mat";
      if (x == "unk" || y == "unk") return "unk";
      return "scalar";
    }
  }

  return go();
}


const into = (k: Kind, e: Kind, x: Raw): Raw => {


  if (JSON.stringify(k) == JSON.stringify(e)) return x;
  if (ismat(k) && ismat(e)) return (x as number[]).map(x=>into(k[1], e[1], x) as number)
  if (!ismat(k) && !ismat(e)) return x == null ? null : cast[k][e] (x as number)
  if (!ismat(k) && ismat(e)) {
    let res = x == null ? null : cast[k][e[1]] (x as number)
    return Array.from({length: 16}, () => res)
  }
  throw new Error("Invalid type conversion");
}



type Ast = Fun | Ast[]

const app = (...a: Ast[]): Fun => {

  let fs = a.flat(10) as Fun[];
  let take = () => fs.shift();

  let go = (): [Kind, Raw] => {

    let f = take();
    if (f == undefined) return null;
    if (f.tag == "const") return [f.kind, f.content];
    let x = go();
    if (x == null) return null;

    if (f.tag == "reduce"){
      let E : Kind = ["matrix", f.expect];
      let d = into(x[0], E, x[1])
      return [f.result, (d as number[]).reduce((acc, x) => f.runner[1](acc, x), f.runner[0])]
    }

    if (f.tag == "move"){
      let E = x[0];
      let d = range(16).map(f.index).map(i=> i == -1 ? null : x[1][i])
      return [E, d]
    }

    if (f.tag == "binary"){
      let y = go();
      if (y == null) return null;
      if (ismat(x[0]) || ismat(y[0])){
        let xd : number[] = into(x[0], ["matrix", f.expect[0]], x[1]) as number[]
        let yd : number[] = into(y[0], ["matrix", f.expect[1]], y[1]) as number[]

        let res = (xd as number[]).map((x, i) => f.runner(x as number, yd[i] as number))
        return [["matrix", f.result], res]
      }
      let xd = into(x[0], f.expect[0], x[1])
      let yd = into(y[0], f.expect[1], y[1])
      return [f.result, f.runner(xd as number, yd as number)]
    }
  }

  let [E, d] = go();
  if (E == null) return null;

  return {
    tag: "const",
    kind: E,
    content: d
  }
}



const i16 = range(16);


const mkinto = (k: Kind, e: Kind): ((x:Raw) => Raw) => {
  if (JSON.stringify(k) == JSON.stringify(e)) return x=>x;
  if (ismat(k) && ismat(e)) return x=>(x as number[]).map(x=>into(k[1], e[1], x) as number)
  if (!ismat(k) && !ismat(e)) return x=> x == null ? null : cast[k][e] (x as number)
  if (!ismat(k) && ismat(e)) {
    return x=>{
      let res = x == null ? null : cast[k][e[1]] (x as number)
      return Array.from({length: 16}, () => res)
    }

  }
  throw new Error("Invalid type conversion");
}

const compile = ( ...a: Ast[]): (x:Fun & {content: Raw})=>Fun => {

  let fs = a.flat(10) as Fun[];
  let take = () => fs.shift();

  let go = (): [Kind, (x:Raw) => Raw] => {

    let f = take();


    if (f.tag == "source") return [f.kind, x=>x]
    if (f == undefined) return null;
    if (f.tag == "const") return [f.kind, ()=>f.content];
    let x = go();
    if (x == null) return null;

    let [X, run] = x


    if (f.tag == "reduce"){
      let E : Kind = ["matrix", f.expect];
      let [df, fn] = f.runner;
      let caster = mkinto(X,E)
      return [f.result, (d )=>(caster(run(d)) as number[]).reduce(fn, df)]
    }

    if (f.tag == "move"){
      if (!ismat(x[0])) return null
      let is = i16.map(f.index)
      return [X, x=>is.map(i=>i == -1 ? null : x[i])]
    }

    if (f.tag == "binary"){
      let y = go();
      if (y == null) return null;

      let [Y, runy] = y;
      if (ismat(X) || ismat(Y)){

        let mkerx = mkinto(X, ["matrix", f.expect[0]])
        let mkery = mkinto(Y, ["matrix", f.expect[1]])

        return [["matrix", f.result], x=>{
          let xx = mkerx(run(x));
          let yy = mkery(runy(x));
          return Array.from({length:16}, (_,i) => f.runner(xx[i], yy[i]))
        }]
      }
      let mkerx = mkinto(X, f.expect[0])
      let mkery = mkinto(Y, f.expect[0])
      return [f.result, x=>f.runner(mkerx(run(x)) as number, mkery(runy(x)) as number)]
    }
  }

  let E = go();
  if (E == null) return null;
  return x=>({tag:"const", kind: E[0], content: E[1](x.content)})
}




let add : Fun = {
  tag: "binary",
  expect: ["number", "number"],
  result: "number",
  runner: (x, y) => x + y
}






const view = (...ast: Ast[]) => {
  let f = app(...ast);
  if (f.tag == "const"){
    if (ismat(f.kind)){
      return put(view_matrix(f.kind[1], f.content as number[]))
    }
    return put(view_scalar(f.kind, f.content as number))
  }
}

const matrix  = (T: ScalarType, data: number[]) : Fun & {content: Raw} => {
  return {
    tag: "const",
    kind: ["matrix", T],
    content: data
  }
}

const binary = (T: ScalarType[], f: (x: number, y: number)=> number) : Fun => {
  if (T.length == 0) T = ["number"];
  if (T.length == 1) T = [T[0], T[0]];
  if (T.length == 2) T = [T[0], T[0], T[1]];
  return {
    tag: "binary",
    expect: [T[0], T[1]],
    result: T[2],
    runner: (x, y) => f(x as number, y as number)
  }
}

const reduce = (T: ScalarType, def:number, f: (x: number, y: number)=> number) : Fun => {
  return {
    tag: "reduce",
    expect: T,
    result: T,
    runner: [def, (x, y) => f(x as number, y as number)]
  }
}

const scalar = (T: ScalarType, x: number) : Fun => {
  return {
    tag: "const",
    kind: T,
    content: x
  }
}


const unary = (T: ScalarType[], f: (x: number)=> number) : Ast[] => {
  if (T.length == 0) T = ["number"];
  if (T.length == 1) T = [T[0], T[0]];
  return [{
    tag: "binary",
    expect: ["number", T[0]],
    result: T[1],
    runner: (_, x) => f(x as number)
  }, scalar("number", 0)]
}

const inc = unary(["number"], (x) => x + 1)

const add2 = binary(["number", "number"], (x, y) => x + y)


const myfield = matrix("block", range(16))


const get_color = unary(["color", "color"], (x) => x)
const get_value = unary(["number", "number"], (x) => x)



const move = (index: (i: number) => number) : Fun => ({tag: "move", index})

const move_dir = (dx: number, dy: number) => {
  return move((i) => {
    let x = i % 4 + dx;
    let y = Math.floor(i / 4) + dy;
    if (x < 0 || x > 3 || y < 0 || y > 3) return -1;
    return x + y * 4;
  })
}

const right = move_dir(1, 0)
const left = move_dir(-1, 0)
const up = move_dir(0, -1)
const down = move_dir(0, 1)
const eq = binary(["block", "boolean"], (x, y) => x == null ? null : y == null ? null : x == y ? 1 : 0)

const or = binary(["boolean"], (x,y) => x || y)
const and = binary(["boolean"], (x,y) => x && y)

const red = [eq, scalar("color", 0), get_color]
const green = [eq, scalar("color", 1), get_color]
const blue = [eq, scalar("color", 2), get_color]

const all = reduce("boolean", 1, (x: number, y: number) => x && y)
const any = reduce("boolean", 0, (x: number, y: number) => x || y)
const sum = reduce("number", 0, (x,y) => x + y)
const prod = reduce("number", 1, (x,y) => x * y)




const n = null;

let fields = [
  [
    n,n,n,n,
    n,n,0,n,
    n,0,n,n,
    n,n,n,n,
  ],
  [
    n,n,n,n,
    n,4,0,n,
    n,n,n,n,
    n,n,6,n,
  ],
  [
    n,n,n,n,
    n,14,n,n,
    1,2,n,n,
    n,n,n,n,
  ],
].map(f => matrix("block", f) )

let X : Fun = {tag: "source", kind: ["matrix", "block"]}

let RX = compile(any, and, green, X, red, right, X)

fields.map(f=>{
  let res = (RX(f))
  view(res)
})


let st = performance.now()

const IT = 80000;

for (let i = 0; i < IT; i++) {
  let res = (RX(fields[i % fields.length]))
}

let et = performance.now()
let dt = et - st

console.log(IT / dt * 1000, "ops/s")



