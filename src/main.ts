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



function new_field(){
  return Array.from({length: 4}, () => Array.from({length: 4}, () => 0))
}




let field = new_field()

field[1][2] = 1
field[2][3] = 5
field[3][0] = 3





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


type Rule = (inT: DataType[]) => {
  T: DataType
  f: (ins: any[]) => any
} | null



let _get_color: Rule = ([{atom, shape}]: DataType[]) => {

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
}


function unaryop(op: Rule) : Rule{
  return ([inT]: DataType[]) => {

    let opR = op([
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
  }
}




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




const View : Rule = ([T]: DataType[]) => {
  return {
    T,
    f: ([x]: any) =>{
      if (T.shape == "scalar") put(atom_view(T.atom, x))
      else put(mat_view(T.atom, x))
    }
  }
}




View([{atom: "block", shape: "mat"}]).f([field])

let get_color = unaryop(_get_color)

log(get_color([{atom: "block", shape: "mat"}]))


function binop(op: (x: number, y: number) => number) : Rule{
  return ([d1, d2]: DataType[]) => {
    if (d1.atom != d2.atom) return null
    return {
      T: {
        atom: d1.atom,
        shape: (d1.shape == d2.shape) ? d1.shape : "mat"
      },
      f: ([x, y]) => {
        [x, y] = broadcast(x, y)
        function go(x: any, y: any){

          if (typeof x == "number" && typeof y == "number"){
            return op(x,y)
          }
          return x.map((xi: any, i: number) => go(xi, y[i]))
        }
        return go(x, y)
      }
    }
  }
}

function reduceop(){
}





log(field)

let rAdd = (binop((x: number, y: number) => x + y))
let rEq = (binop((x: number, y: number) => (x == y) ? 1 : 0))






let add_mat = rAdd([value_arr, value_arr])

// put(show_field(add_mat.f([field, field])))







// function is_empty(inT : DataType[]){

//   let [{atom, shape}] = inT

//   if (atom === "block"){
//     if (shape === 4){

//       return {
//         T: value_arr,
//         f: (x: ndarray.NdArray<Int16Array>) =>{

//           let res = ndarray(new Int16Array(x.shape), x.shape)
//           // ops.eq(x, 0, res)
          
//         }
//       }
      
//     }
//   }
//   return null
// }






