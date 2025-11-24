import { div, h2, html, p } from "./html"
import ndarray, { Data } from "ndarray"
import ops from "ndarray-ops"
import { xlogy } from "webgpu-torch"

export {}



enum Color{
  Black,
  Red,
  Green,
  Blue,
}

const colors = [Color.Black, Color.Red, Color.Green, Color.Blue]


const doc = div(
  {class: "document",
    style:{
      width: "100v%",
    }
  }
)

document.body.appendChild(doc)

function put(el:any){
  doc.append(p(el))
  return el
}

const blockSize = "40px";


class Block{
  color: Color
  x: number

  constructor(color: Color, x: number){
    this.color = color
    this.x = x
  }

  static from(num:number):Block{
    if (num == 0) return new Block(Color.Black, 0)
    let color = colors[num == 0 ? 0 : (1 + ((num-1) % 3))]
    let x = (num - color.valueOf())/3
    return new Block(color, x)
  }

  toNumber():number{
    return this.color.valueOf() + this.x * 3
  }

  

  view(){
    return html("div", {
      style:{
        width: blockSize,
        height: blockSize,
        "color": Color[this.color.valueOf()].toLocaleLowerCase(),
        "text-align": "center",
        "line-height": blockSize,
        "font-family": "sans-serif",
        "font-size": blockSize,
      },
    },
    this.color != Color.Black ? this.x.toString() : ""
  )}

}


class Field{
  data: ndarray.NdArray<Int16Array>
  constructor(data: ndarray.NdArray<Int16Array>){
    this.data = data
    if (String(data.shape) != String([4,4])){
      throw new Error("Invalid shape")
    }
  }

  static empty():Field{
    return new Field(ndarray(new Int16Array(16), [4,4]))
  }

  set(x:number, y:number, block:Block){
    this.data.set(x, y, block.toNumber())
  }

  get(x:number, y:number):Block{
    let val = this.data.get(x, y)
    return Block.from(val)
  }

  view(){
    return div(
      {style:{
        margin: "auto",
        width: `calc(${blockSize}*4)`,
        height: `calc(${blockSize}*4)`,
        border: "1px solid #000",
        background: "#222",
      }},
      ...Array.from({length: 4}, (_, y)=>div(
      {style:{display: "flex"}},

      ...Array.from({length: 4}, (_, x)=>this.get(x, y).view())
    )))
  }
}




let field = Field.empty()
field.set(0, 0, new Block(Color.Blue, 1))

put(field.view())



type DataType = "block" | "color" | "number" | "color_array" | "number_array" | "block_array"





class Rule{
  input : DataType[][]
  output : (inp: DataType[]) => DataType

  func : (input: any) => any

  constructor(input: DataType[][], output: (inp: DataType[]) => DataType, func: (input: any) => any){

    this.input = input
    this.output = output
    this.func = func
  }
}


const get_color = [

  [["block", "block_array"]],

  (inT:DataType[])=>{
    let outT: DataType;
    let func: (input: any) => any;
    if (inT[0] == "block"){
      outT = "color"
      func = (input: Block) => input.color
    }else{
      outT = "color_array"
      func = (input: Field) => 
    }

  }
]






