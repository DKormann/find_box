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

type Atom = "block" | "color" | "value"
type Shape = "scalar" | "arr"
type Color = 0 | 1 | 2 | 3



type BufferType = {
  atom : "block" | "color" | "value"
  shape : "scalar" | "arr"
}


function BufferType(atom: Atom, shape: Shape): BufferType{return {atom, shape}}
const ScalarBlockType = BufferType("block", "scalar")
const ScalarColorType = BufferType("color", "scalar")
const ScalarValueType = BufferType("value", "scalar")
const ArrBlockType = BufferType("block", "arr")
const ArrColorType = BufferType("color", "arr")
const ArrValueType = BufferType("value", "arr")


const ScalarConst = (T: BufferType, value: number): Buffer => ({ tag: "buffer", T,  run: () => value})

type Buffer = {
  tag: "buffer"
  T: BufferType
  run: () => number | number[]
}




type Fun = {
  tag: "fun"
  try: (x: BufferType) => Ast | null
}

type Ast = Buffer | Fun

const ID: Ast = {
  tag: "fun",
  try: (b: Buffer) => b
}

const RED: Ast = ScalarConst(ScalarColorType, 1)
const C1: Ast = ScalarConst(ScalarValueType, 1)
const RED1: Ast = ScalarConst(ScalarBlockType, 1)


const s_EQ: Ast = {
  tag: "fun",
  try: (x: Buffer) =>{
    if (x.T.shape != "scalar") return null
    return {
      tag: "fun",
      try: (y: Buffer) =>{
        if (x.T.atom == y.T.atom && x.T.shape == y.T.shape){
          return {
            tag: "buffer",
            T:  ScalarValueType,
            run: () => String(x.run()) == String(y.run()) ? 1 : 0
          }
        }
        return null
      }
    }
  }
}

const s_unary = (f: (x: number)=> number): Ast => {
  return {
    tag: "fun",
    try: (x: Buffer) => {
      if (x.T.shape != "scalar") return null
      return {
        tag: "buffer",
        T: ScalarValueType,
        run: () => f(x.run() as number)
      }
    }
  }
}



const dummy = (T: BufferType): Buffer => ({
  tag: "buffer",
  T,
  run: () => {throw new Error("Dummy buffer")}
})


const unary = (f: Fun) => {
  return {
    tag: "fun",
    try: (x: Buffer) => {
      if (x.T.shape == "scalar") return f.try(x)
      if (x.T.shape == "arr"){
        let T : BufferType = {...x.T, shape: "scalar"};
        let frun = f.try(dummy(T));
        if (frun == null) return null;
        { return {
          tag : "buffer",
          T: {
            shape: "arr",
            atom: x.T.atom,
          },
          run: () => (x.run() as number[]).map(x=>f.try(
        }
      }}
    }
  }
}


const s_add_1 : Ast = s_unary(x => x + 1)

log(s_add_1)


function app(a: Ast, b: Ast): Ast | null{
  if (a.tag == "fun"){
    if (b.tag == "buffer"){
      return a.try(b)
    }else{
      return {
        tag: "fun",
        try: (x: Buffer) => app(a, b.try(x))
      }
    }
  }
  return null
}


let x = app(s_add_1, app(s_add_1, C1))

