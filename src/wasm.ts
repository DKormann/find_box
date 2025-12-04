import { print } from "./html";

type LoadOp = "arg" | "const"
type BinOp = "add" | "mul" | "and" | "mod" | "eq" | "lt"
type UnaryOp = "neg" | "inv" | "idiv"

type Atom = [LoadOp, number] | [UnaryOp, Atom] | [BinOp, Atom, Atom]

let c: Atom = ["add",
  ["arg", 0],
  ["arg", 1]
]

export const repeat = <T> (length:number, ...value:T[]) : Array<T> => Array.from({length}, _=>value).flat()

const make_wasm = (
  argc: number,
  graph : Atom[]
) => {
  let localc = 0
  const walk = ([op, ...args]: Atom) =>{
    if (op == "arg") {}
    else args.map(x=>walk(print(x)))
  }

  graph.map(x=>walk(x))

  const raster = ([op, ...srcs]:Atom) : number[] => {
    if (op == "arg") return [0x20, srcs[0] as number]
    if (op == "add") return [...srcs.map(s=>raster(s)).flat(), 0x6a]
    throw new Error(`not implemented ${op}`)
  }
  
  const sized = (...code: (number | number[])[]) =>{
    let fl = code.flat()
    return [fl.length, ...fl]
  } 

  const section = (tag: number, ...code: (number | number[])[]) =>[tag, ...sized(...code)]

  return new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, // magic
    0x01, 0x00, 0x00, 0x00, // version

    section( // type section
      0x01,
      0x01,
      0x60, argc, repeat(argc, 0x7f),
      0x01, repeat(graph.length, 0x7f),
    ),
    0x03,2,1,0, // function section
    section( // export
      0x07,
      0x01,
      0x03, 0x61, 0x64, 0x64,
      0,0
    ),
    section(
      0x0a, 1,
      sized(
        localc,
        ...graph.map(x=>raster(x)),
        0x0b
      ),
    )
  ].flat()).buffer
}

let wasm = make_wasm(2, [c])
let add = (await WebAssembly.instantiate(wasm)).instance.exports.add as (x:number, y:number) => number 

print(add)
print(add(2,3))
