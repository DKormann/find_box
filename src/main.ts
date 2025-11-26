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

type Pattern = ScalarType | "any" | ["maybe", Pattern] | ["matrix", Pattern]

type Raw = number[]

type Runner = (x: Raw[]) => Raw

type Fun = {
  expect: Kind[]
  result: Kind
  runner: Runner
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
    return view_scalar(dtype, data[0] as number)
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
    ...Array.from({length: 16}, (_, i) => view_data(k, data.slice(i * size/16, (i+1) * size/16 + 1)))
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
    data[0] ? view_data(k, data.map(x => x-1)) : null
  )}
}


const Matrix = (x: Kind) : Kind => ["matrix", x]
const Maybe = (x: Kind) : Kind => ["maybe", x]



const inc : Fun = {
  expect: ["value"],
  result: "value",
  runner: ([[x]]: Raw[]) => [x + 1]
}

const eq : Fun = {
  expect: ["value", "value"],
  result: "boolean",
  runner: ([[x], [y]]: Raw[]) => [x == y ? 1 : 0]
}

const kindeq = (X: any, E: any) : boolean=> JSON.stringify(X) == JSON.stringify(E)

const zeros = (n: number) => Array.from({length: n}, () => 0);

const range = (n: number) => Array.from({length: n}, (_, i) => i);

const map = (X: Kind[], E: Kind[], f: (x: Raw[]) => Raw[]) : [Kind, Runner] | null=>{
  if (kindeq(X, E)) return null;
  if (X.some(x => x instanceof String)) return null;
  let [m, k] = X[0];
  if (X.some(x => x[0] != m)) return null

  let ks = X.map(x => x[1]) as Kind[];
  let g = map(ks, E, f);
  if (g == null) return null;
  let [rk, rf] = g;

  if (m == "maybe") {

    let h  = (x: Raw[]) => {
      if (x.some(x => x[0] == 0)) return [0, ...zeros(sizeof(rk))]
      return [1, ...rf(x.map(x=>x.slice(1)))]
    }
    return [["maybe", rk], h]
  }

  if (m == "matrix") {
    let sizes = ks.map(sizeof);
    let h = (x: Raw[]) => {
      return range(16).map(i => {
        let a = range(x.length).map(j => x[j].slice(sizes[j] * i, sizes[j] * (i+1)))
        return rf(a)
      })
    }   
  }

  return null;
}




function app(f: Fun, x: Fun) : Fun | null{



  

  

}


