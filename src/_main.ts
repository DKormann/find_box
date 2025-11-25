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

type Dtype = "block" | "color" | "value"
type Shape = "scalar" | "arr"
type Color = 0 | 1 | 2 | 3



type BufferType = {
  tag: "buffer"
  atom : "block" | "color" | "value"
  shape : "scalar" | "arr"
}


function BufferType(atom: Dtype, shape: Shape): BufferType{return {tag:"buffer", atom, shape}}
const ScalarType = (atom: Dtype) => BufferType(atom, "scalar")
const ScalarBlockType = BufferType("block", "scalar")
const ScalarColorType = BufferType("color", "scalar")
const ScalarValueType = BufferType("value", "scalar")
const BlockType = (atom: Dtype) => BufferType(atom, "arr")
const ArrBlockType = BufferType("block", "arr")
const ArrColorType = BufferType("color", "arr")
const ArrValueType = BufferType("value", "arr")

const ScalarConst = (atom: Dtype, value: number): Buffer => ({T: BufferType(atom, "scalar"), run: () => value})

type Raw = number | number[]

type Buffer = {
  T: BufferType
  run: () => Raw
}

type Runner = (x:Raw) => Raw | Runner

type FunT = {
  tag: "fun"
  try: (x: BufferType) => AstT | null
}

type AstT = BufferType | FunT

type Fun = {
  T: FunT,
  run: Runner
}

type Ast = Fun | Buffer


const ID: Fun = {
  T: {
    tag: "fun",
    try: (x: BufferType) => x
  },
  run: (x: Raw) => x
}

const RED: Ast = ScalarConst("color", 1)
const C1: Ast = ScalarConst("value", 1)
const RED1: Ast = ScalarConst("block", 1)



type inPattern<T> = T | ((x:T) => boolean)
type outPattern<T> = T | ((x:T) => T)

const check_pattern = <T>(x: T, pattern: inPattern<T>): boolean => {
  if (typeof pattern === "function") return (pattern as (x:T) => boolean)(x)
  return x === pattern
}


const app_pattern = <T>(p: outPattern<T>, x: T): T => {
  if (typeof p === "function") return (p as (x:T) => T)(x)
  return p
}



const s_unary = (iT: inPattern<Dtype>, oT: outPattern<Dtype>, f: (x: number)=> number): Ast => {
  return {
    T: {
      tag: "fun",
      try: (x: BufferType) => {
        if (!check_pattern(x.atom, iT)) return null;
        if (x.shape != "scalar") return null;
        return ScalarType(app_pattern(oT, x.atom))
      },
    },
    run: (x: Raw) => f(x as number)
  }
}


const s_binary = (iT: inPattern<Dtype>, iT2: inPattern<Dtype>, oT: outPattern<Dtype>, f: (x: number, y: number)=> number): Ast => {
  return {
    T: {
      tag: "fun",
      try: (x: BufferType) => {
        if (!check_pattern(x.atom, iT)) return null;
        if (x.shape != "scalar") return null;

        return {tag: "fun",
          try: (y: BufferType) => {
            if (!check_pattern(y.atom, iT2)) return null;
            if (y.shape != "scalar") return null;
            return ScalarType(app_pattern(oT, x.atom))
          },
        }

      },
    },
    run: (x: Raw) => (y: Raw) =>{
      console.log("binapp run:", x, y)
      return f(x as number, y as number)}
  }
}

function unary = (iT: inPattern<Dtype>, oT: outPattern<Dtype>, f: (x: number)=> number): Ast => {
  return {
    T: {
      tag: "fun",
      try: (x: BufferType) => {

        if (!check_pattern(x.atom, iT)) return null;
        return {
          tag: "fun",
          try: (y: BufferType) => {
            if (!check_pattern(y.atom, iT) || x.atom != y.atom) return null;

          }
        }

      }
    }
  }
}


const bin_arit_T : FunT = {
  tag: "fun",
  try: (x: BufferType) => {
    if (x.atom != "value" && x.atom != "block") return null
    return {tag: "fun", 
      try: (y: BufferType) => {
        if (y.atom != "value" && y.atom != "block") return null
        return BufferType("value", x.shape == "arr" || y.shape == "arr" ? "arr" : "scalar")
      }
    }
  }
}

const binary = (T: FunT, f: (x: number, y: number)=> number): Ast => {

  T, run: (x: Raw) => (y: Raw) => 

}


const s_inc = s_unary("value", "value", x => x + 1)

let x = s_inc.run(C1.run())

log(x)



function appT(a: AstT, b: AstT): AstT | null{
  if (a.tag == "fun"){
    if (b.tag == "fun") return {tag: "fun", try: (x: BufferType) => appT(a, b.try(x))}
    return a.try(b as BufferType)
  }
  return null
}


const s_add = s_binary("value", "value", "value", (x, y) => x + y)

log(appT(appT(s_add.T, C1.T), C1.T))


function app(a: Ast, b: Ast) : Ast | null{

  let T = appT(a.T, b.T)
  let temp = b.run;

  let run : Raw | Runner = (x: Raw) : Raw | Runner => {

    let y = temp(x);
    if (y instanceof Function){
      temp = y;
      return run;
    }
    return a.run(y);
  }

  if (T.tag == "buffer"){
    if (T.tag == "buffer"){
      return { T, run: ()=> a.run((b as Buffer).run()) as Raw}
    }
  }else{
    if (b.T.tag == "buffer") return { T, run: (x: Raw) => (a.run((b as Buffer).run()) as Runner) (x) }
    return {T, run}
  }
}




let r = app(app(s_add, C1), ScalarConst("value", 2))



log(r.run())
