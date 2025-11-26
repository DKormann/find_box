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
type ScalarType = "block" | "color" | "value" | "boolean"
type Kind = ScalarType | ["maybe", Kind] | ["matrix", Kind]


type Raw = number | Raw[]

type Runner = (x: Raw[]) => Raw

type Fun = {
  tag: "elementary",
  expect: ScalarType[]
  result: Kind
  runner: (x: number[]) => number
} | {
  tag: "reduce",
  expect: ScalarType
  result: ScalarType
  runner: (x: number, y: number) => number
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
    value: x => Math.floor(x / 3),
    color: x => x % 3,
    boolean: x=> Math.floor(x / 3) == 0 ? 0 : 1,
    block: x=>x,
  },
  color: {
    value: x => x,
    block: x => x,
    boolean: x=> x == 0 ? 0 : 1,
    color: x=>x,
  },
  value: {
    block: x => x * 3,
    color: x => x % 3,
    boolean: x=>x == 0 ? 0 : 1,
    value: x=>x,
  },
  boolean: {
    value: x=>x,
    block: x=>x,
    color: x=>x,
    boolean: x=>x,
  }
}

const view_scalar = (kind: ScalarType, num: number)=>{
  return div({
    style:{
      color: colors[kind == "block" ? cast.block.color(num) : kind == "boolean" ? num : 4],
      background: kind == "color" ? colors[num] : colors[3],
      width: blockSize, height: blockSize,
      "text-align": "center", "font-size": blockSize, "font-weight": "bold", },
  }, kind == "value" ? num : kind == "block" ? cast.block.value(num) : kind == "boolean" ? [num == 0 ? "X" : "v"] : "")
}

put(view_scalar("value", 1))
put(view_scalar("block", 0))
put(view_scalar("block", 1))
put(view_scalar("boolean", 1))
put(view_scalar("boolean", 0))
put(view_scalar("color", 1))



const sizeof = (dtype: Kind) : number => {
  if (typeof dtype == "string") return 1;
  let [m, k] = dtype;
  if (m == "matrix") return sizeof(k) * 16;
  if (m == "maybe") return sizeof(k) + 1;
  return 0;
}

const gridsize = (dtype: Kind) : number => {
  if (typeof dtype == "string") return 1;
  let [m, k] = dtype;
  if (m == "matrix") return gridsize(k) * 16;
  return gridsize(k);
}

const view_data = (dtype: Kind, data: Raw) => {
  let size = sizeof(dtype);
  if (typeof dtype == "string") {
    return view_scalar(dtype, data as number)
  }

  let [m, k] = dtype;
  if (m == "matrix") {
    return div({style:{
      display: "flex",
      "flex-wrap": "wrap",
      "background-color": "#111",
      border: "1px solid #888",
      "width": `calc(${blockSize} * ${Math.sqrt(size)})`
    }}, 
    (data as Raw[]).map(x => view_data(k, x))
  )
  }
  if (m == "maybe") {

    return div({style:{
      display: "flex",
      "flex-wrap": "wrap",
      "background-color": "#111",
      width: `calc(${blockSize} * ${Math.sqrt(size)})`,
      height: `calc(${blockSize} * ${Math.sqrt(size)})`
    }},
    data ? view_data(k, data[0]) : null
  )}
}


const Matrix = (x: Kind) : Kind => ["matrix", x]
const Maybe = (x: Kind) : Kind => ["maybe", x]



const myfield : Fun = {
  tag: "elementary",
  expect: [],
  result: ["matrix", ["maybe", "value"]],
  runner: ([]: Raw[]) => range(16).map(i=>[i])
}



const kindeq = (X: any, E: any) : boolean=> JSON.stringify(X) == JSON.stringify(E)
const zeros = (n: number) => Array.from({length: n}, () => 0);
const range = (n: number) => Array.from({length: n}, (_, i) => i);


const inc : Fun = {
  tag: "elementary",
  expect: ["value"],
  result: "value",
  runner: (x: Raw) => x as number + 1
}

const eq : Fun = {
  tag: "elementary",
  expect: ["value", "value"],
  result: "boolean",
  runner: ([x, y]: Raw[]) => x == y ? 1 : 0
}


put(view_data(myfield.result, myfield.runner([])))
