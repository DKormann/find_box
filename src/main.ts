import { div, h2, html, p } from "./html"
// import ndarray, { Data } from "ndarray"
// import ops from "ndarray-ops"

export {}

const doc = div(
  {class: "document",
    style:{
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
type Color = 0 | 1 | 2 | 3
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







type DataType = {
  atom : "block" | "color" | "value"
  shape : "scalar" | "mat"
}


const value_arr: DataType = {
  atom: "value",
  shape: "mat"
}


function to_shape(x: any, shape: number[]){
  if (shape.length == 0) return x
  if (x instanceof Array)return x.map(y => to_shape(y, shape.slice(1)))
  return Array.from({length: shape[0]}, () => to_shape(x, shape.slice(1)))
}

function get_shape(x: any){
  if (x instanceof Array) return [x.length, ...get_shape(x[0])]
  return []
}

function broadcast(x: any, y: any){
  let s1 = get_shape(x)
  let s2 = get_shape(y)
  return [to_shape(x, s2), to_shape(y, s1)]
}


type Rule ={
  arity: number,
  exec: (inT: DataType[]) => {
    T: DataType
    f: (ins: any[]) => any
  }
} | null




let new_field: Rule = ({arity: 0, exec:(Ts: DataType[]) => {

  return {
    T:{
      atom: "block",
      shape: "mat"
    },
    f: () => Array.from({length: 4}, () => Array.from({length: 4}, () => 0))
  }
}})



function atom_view(T:DataType['atom'], x: number){

  let color = "white";
  let val = "#";
  if (T == "color") color = colors[x]
  if (T == "block") {
    let cn = x == 0 ? 0 : (x-1) % 3 + 1
    val = cn > 0 ? String((x - cn) / 3 + 1) : "";
    color = colors[cn]
  }
  if (T == "value") {
    val = String(x)
  }

  return div({
    style:{
      width: blockSize,
      height: blockSize,
      color,
      "text-align": "center",
      "font-size": blockSize,
      "font-weight": "bold",
    },
  }, val)
}


function mat_view(T: DataType['atom'], x: any){
  return div({
    style:{
      display: "flex",
      "flex-wrap": "wrap",
      width: `calc(${blockSize} * 4)`,
      margin: "auto",
      "background": "#111",
      "border": "1px solid white",
    }
  }, x.map(row => div(...row.map(block => atom_view(T, block))))
  )
}




const View : Rule = ({arity: 1, exec: ([T]: DataType[]) => {
  return {
    T,
    f: ([x]: any) =>{
      if (T.shape == "scalar") put(atom_view(T.atom, x))
      else put(mat_view(T.atom, x))
    }
  }
}})



let _get_color: Rule = ({arity: 1, exec: ([{atom, shape}]: DataType[]) => {

  if (shape == "mat") return null
  if (atom == "block") {
    return {
      T: {
        atom: "color",
        shape: "scalar"
      },
      f: ([x]) => x == 0 ? 0 : (x-1) % 3 + 1
    }
  }
  return null
}})


function unaryop(op: Rule) : Rule{
  return ({arity: 1, exec: ([inT]: DataType[]) => {

    let opR = op.exec([
      {
        atom: inT.atom,
        shape: "scalar"
      }
    ])

    if (opR == null) return null

    return {
      T: {
        atom: opR.T.atom,
        shape: inT.shape
      },
      f: ([x]) => {
        let go = (x: any)=>{
          if (typeof x == "number"){
            return opR.f([x])
          }
          return x.map((xi: any) => go(xi))
        }
        return go(x)
      }
    }
  }})
}


function binop(elementary: Rule) : Rule {
  if (elementary.arity != 2) throw new Error("elementary rule must have arity 2")
  return {arity: 2, exec: ([d1, d2]: DataType[]) => {
    let R = elementary.exec([
      {atom: d1.atom, shape: "scalar"},
      {atom: d2.atom, shape: "scalar"}
    ])
    if (R == null) return null

    function go(x: any, y: any){
      if (typeof x == "number" && typeof y == "number"){
        return R.f([x, y])
      }
      return x.map((xi: any, i: number) => go(xi, y[i]))
    }
    return {
      T:{
        atom: R.T.atom,
        shape: (d1.shape == d2.shape) ? d1.shape : "mat"
      },
      f: ([x, y]) => {
        [x, y] = broadcast(x, y)
        return go(x, y)
      }
    }
  }
}}




function apply(a:Rule, b:Rule) : Rule{
  if (b.arity == 0){

    let bR = b.exec([])
    
    if (a.arity == 1){
      
      let aR = a.exec([bR.T])
      if (aR == null) return null
      return {
        arity: 0,
        exec: () => aR.f([bR.f([])])
      }
    }
  }else{
    return {
      arity: a.arity + b.arity - 1,
      exec: (args) => {
        
      }
    }
  }
}

let show0: Rule= apply(View, new_field)

show0.exec([])



