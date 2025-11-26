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

type Raw = number[]

type Runner = (x: Raw[]) => Raw

type Fun = {
  arity: number
  
  T: (t: Kind[]) => {
    dtype: Kind
    run: Runner
  } | null
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
  if (m == "maybe") return sizeof(k);
  return 0;
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


// const view = (...fs: Fun[]) => {
//   let f = chain(...fs);
//   if (f.arity == 0){
//     let T = f.T([]);
//     let dat = T.run([]);
//     if (T.dtype.shape == "scalar") put(view_scalar(T.dtype.kind, dat[0]));
//     else{
//       put(div({style:{
//         display: "flex",
//         "flex-wrap": "wrap",
//         "background-color": "#111",
//         border: "1px solid #888",
//         "width": `calc(${blockSize} * 4)`
//       }}, ...(dat as number[]).map(x => view_scalar(T.dtype.kind, x))));
//     }
//   }
//   else log(`FUN(${Array.from({length: f.arity}, (_, i) => `x${i}`).join(', ')})`)
//   return f;
// }




const Matrix = (x: Kind) : Kind => ["matrix", x]
const Maybe = (x: Kind) : Kind => ["maybe", x]




const fun = (arity: number, T: (x: Kind[]) => [Kind, Runner] | null) : Fun =>({
  arity, T: (x: ScalarType[]) => mapnull(T(x), r=>({dtype: r[0],run: r[1]})) })


const myfield = fun(0, ()=>[
  Matrix(Maybe("block")),
  (x: Raw[]) => ([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])
])


let mf = myfield.T([]);
put(view_data(mf.dtype, mf.run([])))


const range = (x:number) => Array.from({length: x}, (_, i) => i);

const i16 = range(16);







function Buffer(dtype: Kind, raw: Raw) : Fun {
  return {
    arity: 0,
    T: ()=>({dtype, run: ()=>raw}),
  }
}

let d = Buffer(Matrix(Maybe("value")), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])

put(view_data(d.T([]).dtype, d.T([]).run([])))





const kindeq = (a: Kind, b: Kind) : boolean => JSON.stringify(a) == JSON.stringify(b);



function smap(outer: Kind, expect: ScalarType, out: ScalarType, f: (x: number)=> number) : [Kind, (x: Raw) => Raw] {
  if (typeof outer == "string") return [out, ([x]: Raw) =>  [f(cast[outer][expect](x))]]

  let [m, k] = outer;
  let [r, g] = smap(k, expect, out, f);

  if (m == "matrix"){
    let size = sizeof(k)
    return [Matrix(r), (x: Raw) => Array.from({length: 16}, (_, i) => x.slice(i * size, (i+1) * size + 1)).flatMap(g)]
  }
  if (m == "maybe"){
    return [Maybe(r), (x: Raw) => x[0] ? g(x.map(x=>x-1)).map(x=>x+1) : [0]]
  }
}


function ufun(X : ScalarType, Y: ScalarType, f : (x: number)=> number) : Fun {
  return {
    arity: 1,
    T: ([A]: Kind[]) => {

      let [r, g] = smap(A, X, Y, f);
      return {dtype: r, run: ([x]: Raw[]) => g(x)}
    }
  }
}



const inc : Fun = ufun("value", "value", (x) => x + 1);
const ind = inc.T([d.T([]).dtype]);

put(view_data(ind.dtype, ind.run([d.T([]).run([])])))


function bfun(X: [Kind, Kind], Y: Kind, f: (x: Raw, y: Raw)=> Raw) : Fun {

  return {
    arity: 2,
    T: ([A, B]: Kind[]) => {
      if (kindeq(A, X[0]) && kindeq(B, X[1])) return {
        dtype: Matrix(Maybe("value")),
        run: ([x, y]: Raw[]) => f(x, y)
      }

      if (A instanceof String || B instanceof String) return null;

      let [ma, ka] = A;
      let [mb, kb] = B;
      if (ma != mb) return null;

      if (ma == "maybe") {
        let r = bfun(X, Y, f).T([ka as Kind, kb as Kind])

        let res = mapnull(r, r=>{
          let run = ([x, y]: Raw[]) => (x[0] == 0 || y[0] == 0) ? range(sizeof(Y)).map(x=>0) : r.run([x.map(x=>x-1), y.map(x=>x-1)]).map(x=>x+1);

          return {
            dtype: Maybe(r.dtype),
            run
          }
        })
        return res
      }
      return null;
    }
  }

}



const eq = bfun(["value", "value"], "boolean", (x, y) => [x == y ? 1 : 0]);






// function app(a: Fun, b: Fun) : Fun | null{
//   if (a.arity == 0) return null;
//   let arity = a.arity - 1 + b.arity;
//   let T =  (x: ScalarType[]) => {
//     let [xb, xa] =[ x.slice(0, b.arity), x.slice(b.arity)];
//     let rb = b.T(xb);
//     if (rb == null) return null;
//     let ra = a.T([rb.dtype, ...xa]);
//     if (ra == null) return null
//     return {
//       dtype: ra.dtype,
//       run: (x: Raw[]) => {
//         let [xb, xa] =[ x.slice(0, b.arity), x.slice(b.arity)];
//         xa = [rb.run(xb), ...xa];
//         return ra.run(xa);
//       }
//     }
//   }
//   if (arity == 0){
//     let Tres = T([])
//     if (Tres == null) return null
//     else T = ()=> Tres
//   }
//   return {arity, T}
// }




// const sbroadcast = (x: number) : number[]=> {
//   return Array.from({length: 16}, ()=>x)
// }


// const bin_broad_shape = (x: Shape, y: Shape): Shape => {
//   return x == y ? x : "arr";
// }


// const broadcast = (x: Raw, y: Raw): [Raw, Raw] => {
//   if (x.length == y.length) return [x, y];
//   return [
//     (x.length > 1 ? x : sbroadcast(x[0])),
//     (y.length > 1 ? y : sbroadcast(y[0]))
//   ]
// }

// const bin_broad_raw = (x: Raw, y: Raw, fun: (x: number, y: number)=> number): Raw => {
//   let [xa, xb] = broadcast(x, y);
//   return (xa as number[]).map((x, i) => fun(x, xb[i]));
// }


// const get_val = (kind: Kind, x: number): number => {
//   if (x == 0) return 0;
//   if (kind == "block") return from_block(x)[1];
//   return x;
// }


// const mkfun = (X: Kind[], Y: Kind, run: (x: Raw[]) => Raw) : Fun => {
//   return {
//     arity: X.length,
//     T: (x: ScalarType[]) => {
//       if (! x.every((y, i) => y.kind == X[i])) return null;
//       return {
//         dtype: {kind: Y, shape: x[0].shape},
//         run: (x: Raw[]) => run(x)
//       }
//     }
//   }
// }




// const unary_math = (f: (x: number)=> number): Fun => {
//   return {
//     arity: 1,
//     T: ([A]: ScalarType[]) =>{
//       if (A.kind != "value" && A.kind != "block") return null;
//       let run = ([a]: Raw[]) => {
//         let g = f;
//         if (A.kind == "block"){
//           g = (x: number) => {
//             if (x == 0) return 0;
//             let [col, val] = from_block(x);
//             return to_block(col, f(val));
//           }
//         }
//         return (a as number[]).map(g);
//       }
//       return {
//         dtype: {
//           kind: A.kind,
//           shape: A.shape
//         },
//         run,
//       }
//     }
//   }
// }


// const binary_math = (f: (x: number, y: number)=> number): Fun => {
//   return {
//     arity: 2,
//     T: ([A, B]: ScalarType[]) => {
//       if (A.kind != "value" && A.kind != "block") return null;
//       if (B.kind != "value" && B.kind != "block") return null;
//       let shape = A.shape == B.shape ? A.shape : "arr";
//       let kind : Kind = "value";
//       let g = (x: number, y: number) => f(get_val(A.kind, x), get_val(B.kind, y));

//       return {
//         dtype: {kind, shape },
//         run: ([a,b]: Raw[]) => {
//           let [xa, xb] = broadcast(a, b);
//           return (xa as number[]).map((x, i) => g(x, xb[i]));
//         }
//       }
//     }
//   }
// }


// const inc = unary_math((x: number) => x + 1)
// const add = binary_math((x: number, y: number) => x + y)

// const new_field : Fun = {
//   arity: 0,
//   T: ()=>({
//     dtype: {
//       kind: "block",
//       shape: "arr"
//     },
//     run: ()=>{
//       let ar = Array.from({length: 16}, ()=>0)
//       ar[0] = 1
//       ar[4] = 6
//       ar[6] = 7
//       return ar
//     }
//   })
// }

// const get_color = (kind: Kind, num: number) => {
//   return kind == "block" ? num == 0 ? 0 : (num-1) % 3 + 1 : kind == "color" ? num : 4;
// }

// const index = (f: (x: number, y: number) => [number, number], data: number[]) => {
//   return Array.from({length: 16}, (_, i) => {
//     let [x, y] = f(i % 4, Math.floor(i / 4));
//     return x < 0 || x >= 4 || y < 0 || y >= 4 ? 0 : data[x + y * 4]
//   })
// }

// const move = (f: (x: number, y: number) => [number, number]) => {
//   return {
//     arity: 1,
//     T: ([A]: ScalarType[]) => {
//       if (A.shape != "arr") return null;
//       return {
//         dtype: A,
//         run: ([x]: Raw[]) => index(f, x as number[])
//       }
//     }
//   }
// }

// const right = move((x, y) => [x - 1, y])
// const left = move((x, y) => [x + 1, y])
// const up = move((x, y) => [x, y - 1])
// const down = move((x, y) => [x, y + 1])

// const colorof = mkfun(["block"], "color", ([x]: Raw[]) => x.map(y => from_block(y)[0]))
// const blockval = mkfun(["block"], "value", ([x]: Raw[]) => x.map(y => from_block(y)[1]))
// const colorval = mkfun(["color"], "value", ([x]: Raw[]) => x)
// const toblock = mkfun(["value", "color"], "block", ([x, y]: Raw[]) => x.map((z, i) => to_block(y[i] as Color, z)))

// const eq : Fun = {
//   arity: 2,
//   T: ([A, B]: ScalarType[]) => {
//     if (A.kind != B.kind) return null;
//     return {
//       dtype: {kind: "value", shape: bin_broad_shape(A.shape, B.shape)},
//       run: ([x, y]: Raw[]) => bin_broad_raw(x, y, (x, y) => x == y ? 1 : 0)
//     }
//   }
// }

// const not : Fun = {
//   arity: 1,
//   T: ([A]: ScalarType[]) => ({
//     dtype: {kind: "value", shape: A.shape},
//     run: ([x]: Raw[]) => x.map(y => y == 0 ? 1 : 0)
//   })
// }



// const chain = (...fs: Fun[]) => {
//   if (fs.length == 0) return null;
//   let f = fs[0];
//   let x = fs[1];
//   if (!x) return f;
//   let a = app(f, x);
//   if (a == null) return null;
//   return chain(a, ...fs.slice(2));
// }

// // view( new_field);
// // log("blockval")

// // view(blockval, new_field)
// // view(colorval, colorof, new_field)

// // view(colorof, new_field)
// // view(eq, colorval, colorof, new_field, blockval, new_field)
// // view(not, eq, new_field, inc, new_field)
