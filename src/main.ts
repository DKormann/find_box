
import { div, h2, html, p } from "./html"
// import ndarray, { Data } from "ndarray"
// import ops from "ndarray-ops"

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


function put(el:HTMLElement){
  doc.append(el)
  return el
}

function log(el:any){
  put(p(JSON.stringify(el)))
  return el
}


const blockSize = "40px";

const colors = ["black", "red", "green", "#0044FF"]

function show_block(block: number){
  let color: Color = block == 0 ? 0 : (block-1) % 3 + 1 as Color
  let val = (block - color) / 3 + 1;
  return div({
    style:{
      width: blockSize,
      height: blockSize,
      "color": colors[color],
      "text-align": "center",
      "font-size": blockSize,
      "font-weight": "bold",
    },
  },
  String(color > 0 ? val : "")
)}









type Dtype = "block" | "color" | "value"
type Shape = "scalar" | "arr"
type Color = 0 | 1 | 2 | 3



type DataType = {
  kind: "block" | "color" | "value"
  shape: "scalar" | "arr"
}

type Raw = number | number[];

type Runner = (x: Raw[]) => Raw


type Fun = {
  arity: number
  T: (t: DataType[]) => {
    dtype: DataType
    run: Runner
  } | null
}


const broadcast = (x: number) => {
  Array.from({length: 16}, ()=>x)
}


const unary_math = (f: (x: number)=> number): Fun => {
  return {
    arity: 1,
    T: ([A]: DataType[]) =>{
      if (A.kind != "value" && A.kind != "block") return null;
      let run = ([a]: Raw[]) => {
        let g = f;
        if (A.kind == "block"){
          g = (x: number) => f(x == 0 ? 0 : Math.trunc ((x-1) / 3))
        }
        let res: Raw ;
        if (A.shape == "arr"){
          res = (a as number[]).map(g)
        }else{
          res = g(a as number)
        }
        return 0
      }
      return {
        dtype: {
          kind: "value",
          shape: A.shape
        },
        run,
      }
    }
  }
}


const inc = unary_math((x: number) => x + 1)

const new_field : Fun = {
  arity: 0,
  T: ()=>({
    dtype: {
      kind: "block",
      shape: "arr"
    },
    run: ()=>{
      return Array.from({length: 16}, ()=>0)
    }
  })
}


const view_scalar = (kind: Dtype, num: number)=>{
  // let color
  return div({
    style:{
      width: blockSize,
      height: blockSize,
      "color": colors[num],
      "text-align": "center",
      "font-size": blockSize,
      "font-weight": "bold",
    },
  }, String(num))
}


put(view_scalar("value", 1))


log(new_field.T([])!.run([]))

