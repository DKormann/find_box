import { print } from "./html";
import { uop, UOp } from "./uop"


export const repeat = <T> (length:number, ...value:T[]) : Array<T> => Array.from({length}, _=>value).flat()

export const compile = async (
  argc: number,
  graph : UOp[]
) => {
  let localc = 0

  const raster = (x:UOp) : number[] => {
    print(x)
    if (x.op == "load" ) return [0x20, x.arg]
    if (x.op == "add") return [...x.args.map(s=>raster(s)).flat(), 0x6a]
    throw new Error(`not implemented ${x.op}`)
  }
  
  const sized = (...code: (number | number[])[]) =>{
    let fl = code.flat()
    return [fl.length, ...fl]
  } 

  const section = (tag: number, ...code: (number | number[])[]) =>[tag, ...sized(...code)]

  let buf = new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, // magic
    0x01, 0x00, 0x00, 0x00, // version

    section( // type section
      0x01, 0x01,
      0x60, argc, repeat(argc, 0x7f),
      0x01, repeat(graph.length, 0x7f),
    ),
    0x03,2,1,0, // function section
    section( // export
      0x07, 0x01,
      0x01, 0x66,
      0,0
    ),
    section(
      0x0a, 1,
      sized(localc, ...graph.map(x=>raster(x)), 0x0b ),
    )
  ].flat())


  return (await WebAssembly.instantiate(buf.buffer)).instance.exports.f as (x:number, y:number) => number 
}

let c = uop.add(uop.load(0), uop.load(1))

let F = await compile(2, [c])
// print(F(2,3))

