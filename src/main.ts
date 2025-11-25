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

const colors = ["black", "red", "green", "#0044FF", "white"]


type Kind = "block" | "color" | "value"
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


const sbroadcast = (x: number) : number[]=> {
  return Array.from({length: 16}, ()=>x)
}


const broadcast = (x: Raw, y: Raw): [Raw, Raw] => {
  if (x instanceof Number && y instanceof Number) return [x, y];
  return [
    (x instanceof Array ? x : sbroadcast(x)),
    (y instanceof Array ? y : sbroadcast(y))
  ]

}

const from_block = (x: number): [Color, number] =>{
  let col = (x-1) % 3 + 1 as Color;
  return [col, (x-col) / 3 + 1];
}

const get_val = (kind: Kind, x: number): number => {
  if (x == 0) return 0;
  if (kind == "block") return from_block(x)[1];
  return x;
}

const to_block = (col: Color, val: number): number => (val - 1) * 3 + col;


const unary_math = (f: (x: number)=> number): Fun => {
  return {
    arity: 1,
    T: ([A]: DataType[]) =>{
      if (A.kind != "value" && A.kind != "block") return null;
      let run = ([a]: Raw[]) => {
        let g = f;
        if (A.kind == "block"){
          g = (x: number) => {
            if (x == 0) return 0;
            let [col, val] = from_block(x);
            return to_block(col, f(val));
          }
        }
        let res: Raw ;
        if (A.shape == "arr"){
          res = (a as number[]).map(g)
        }else{
          res = g(a as number)
        }
        return res;
      }
      return {
        dtype: {
          kind: A.kind,
          shape: A.shape
        },
        run,
      }
    }
  }
}


const binary_math = (f: (x: number, y: number)=> number): Fun => {
  return {
    arity: 2,
    T: ([A, B]: DataType[]) => {
      if (A.kind != "value" && A.kind != "block") return null;
      if (B.kind != "value" && B.kind != "block") return null;
      let shape = A.shape == B.shape ? A.shape : "arr";
      let kind : Kind = "value";
      let g = (x: number, y: number) => f(get_val(A.kind, x), get_val(B.kind, y));

      return {
        dtype: {kind, shape },
        run: ([a,b]: Raw[]) => {
          if (shape == "scalar") return g(a as number, b as number);
          let [xa, xb] = broadcast(a, b);
          return (xa as number[]).map((x, i) => g(x, xb[i]));
        }
      }
    }
  }
}


const inc = unary_math((x: number) => x + 1)
const add = binary_math((x: number, y: number) => x + y)

const new_field : Fun = {
  arity: 0,
  T: ()=>({
    dtype: {
      kind: "block",
      shape: "arr"
    },
    run: ()=>{
      let ar = Array.from({length: 16}, ()=>0)
      ar[0] = 1
      ar[4] = 6
      ar[6] = 7
      return ar
    }
  })
}


const get_color = (kind: Kind, num: number) => {
  return kind == "block" ? num == 0 ? 0 : (num-1) % 3 + 1 : kind == "color" ? num : 4;
}

const view_scalar = (kind: Kind, num: number)=>{
  let color = get_color(kind, num);
  let content = kind == "value" ? num : kind == "block" ? ( num ? (num - color) / 3 + 1 : "") : "#";
  return div({
    style:{
      width: blockSize,
      height: blockSize,
      "color": colors[color],
      "text-align": "center",
      "font-size": blockSize,
      "font-weight": "bold",
    },
  }, content)
}


const view = (f: Fun) => {
  if (f.arity == 0){
    let T = f.T([]);
    let dat = T.run([]);
    if (T.dtype.shape == "scalar") put(view_scalar(T.dtype.kind, dat as number));
    else{
      put(div({style:{
        display: "flex",
        "flex-wrap": "wrap",
        "background-color": "#111",
        border: "1px solid #888",
        "width": `calc(${blockSize} * 4)`
      }}, ...(dat as number[]).map(x => view_scalar(T.dtype.kind, x))));
    }
  }

  else log(`FUN(${Array.from({length: f.arity}, (_, i) => `x${i}`).join(', ')})`)

  return f;
}

const kinds : Kind[] = ["value", "block", "color"]
const shapes : Shape[] = ["scalar", "arr"]

const data_types : DataType[] = kinds.flatMap(kind => shapes.map(shape => ({kind, shape})))



function app(a: Fun, b: Fun) : Fun | null{
  if (a.arity == 0) return null;
  let arity = a.arity - 1 + b.arity;
  return {
    arity,
    T: (x: DataType[]) => {
      let [xb, xa] =[ x.slice(0, b.arity), x.slice(b.arity)];
      let rb = b.T(xb);
      if (rb == null) return null;
      let ra = a.T([rb.dtype, ...xa]);
      return {
        dtype: ra.dtype,
        run: (x: Raw[]) => {
          let [xb, xa] =[ x.slice(0, b.arity), x.slice(b.arity)];
          xa = [rb.run(xb), ...xa];
          return ra.run(xa);
        }
      }
    }
  }
}




view(new_field);
view(app(inc, new_field));


view(add)

let dub = app(add, new_field);

view(dub)

dub = app(dub, new_field);

view(dub)



const right: Fun = {
  arity: 1,
  T: ([A]: DataType[]) => {
    if (A.shape != "arr") return null;

    return {
      dtype: A,
      run: ([x]: Raw[]) => x as number[],
    }
  }
}


view(app(right, new_field))

