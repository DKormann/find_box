import { div, h2, html, p, span } from "./html"
export {}

const doc = div(
  {class: "document",
    style:{
      padding: "1em",
      width: "100%",
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
    {style: {"font-family": "monospace", "text-align": "center"}},
    el.map(e => span((typeof e == "string" ? e : JSON.stringify(e)) + " "))
  ))
  return el
}

const blockSize = "40px";
const colors = ["var(--background-color)", "red", "green", "#0044FF", "var(--color)"]
type ScalarType = "block" | "color" | "number" | "boolean"
type Kind = ScalarType | ["matrix", ScalarType]

type Raw = number | Int32Array
type Runner = (x: Raw[]) => Raw

type Fun =
{
  tag: "source"
  kind: Kind,
} | {
  tag: "const",
  kind: Kind,
  content: Raw
} | {
  tag: "binary",
  expect: [ScalarType, ScalarType]
  result: ScalarType,
  runner: (x: number, y: number) => number
} | {
  tag: "reduce",
  expect: ScalarType
  result: ScalarType
  runner: [number, (x: number, y: number) => number]
} | {
  tag: "move",
  index : (i: number) => number,
}


const cast : Record<ScalarType, Record<ScalarType, (x: number) => number>> = {
  block: {
    number: x => x == 0 ? 0 : Math.floor((x+2) / 3),
    color: x => x == 0 ? 0 : ((x-1) % 3) + 1,
    boolean: x=> x == 0 ? 0 : 1,
    block: x=>x,
  },
  color: {
    number: x => x,
    block: x => x,
    boolean: x=> x == 0 ? 0 : 1,
    color: x=>x,
  },
  number: {
    block: x => x * 3,
    color: x => x == 0 ? 0 : (x-1) % 3 + 1,
    boolean: x=>x == 0 ? 0 : 1,
    number: x=>x,
  },
  boolean: {
    number: x=>x,
    block: x=>x,
    color: x=>x,
    boolean: x=>x,
  }
}

const view_scalar = (kind: ScalarType, num: number)=>{
  if (num == null) throw new Error("Null scalar");
  return div(
    {
      onclick: () =>{
        console.log(kind, num)
      },

      style:{
        ... (num != null ? {
          color: colors[kind == "block" ? cast.block.color(num) : kind == "boolean" ? 2 : 4],
          background: kind == "color" ? colors[num] : colors[0],
        }: {background: colors[0]}),
        width: blockSize, height: blockSize,
        "text-align": "center", "font-size": blockSize, "font-weight": "bold", },
    }, kind == "number" ? num : kind == "block" ? (num == 0 ? "" : cast.block.number(num)) : kind == "boolean" ? [num == 0 ? "" : "✓"] : "")
}

const view_matrix = (dtype: ScalarType, data: Int32Array) => {
    return div({style:{
      display: "flex",
      "flex-wrap": "wrap",
      "background-color": "#111",
      border: "1px solid #888",
      "width": `calc(${blockSize} * 4)`
    }}, 
    Array.from(data).map(x => view_scalar(dtype, x))
  )
}


const ismat = (k: Kind) => k instanceof Array;
const into = (k: Kind, e: Kind, x: Raw): Raw => {


  if (JSON.stringify(k) == JSON.stringify(e)) return x;
  if (ismat(k) && ismat(e)) return (x as Int32Array).map(x=>into(k[1], e[1], x) as number)
  if (!ismat(k) && !ismat(e)) return x == null ? null : cast[k][e] (x as number)
  if (!ismat(k) && ismat(e)) {
    let res = x == null ? null : cast[k][e[1]] (x as number)
    return Int32Array.from({length: 16}, () => res)
  }
  throw new Error("Invalid type conversion");
}


type Ast = Fun | Ast[]


const i16 = Int32Array.from({length: 16}, (_, i) => i);




const mkinto = (k: Kind, e: Kind): ((x:Raw) => Raw) => {
  if (JSON.stringify(k) == JSON.stringify(e)) return x=>x;
  if (ismat(k) && ismat(e)) return x=>(x as Int32Array).map(x=>into(k[1], e[1], x) as number)
  if (!ismat(k) && !ismat(e)) return x=> cast[k][e] (x as number)
  if (!ismat(k) && ismat(e)) {
    return x=>{
      let res = cast[k][e[1]] (x as number)
      return Int32Array.from({length: 16}, () => res)
    }

  }
  throw new Error("Invalid type conversion");
}

const wire = ( ...a: Ast[]): (x:Fun & {content: Raw})=>Fun => {

  let fs = a.flat(10) as Fun[];
  let take = () => fs.shift();

  let go = (): [Kind, (x:Raw) => Raw] => {

    let f = take();

    if (f.tag == "source") return [f.kind, x=>x]
    if (f == undefined) return null;
    if (f.tag == "const") return [f.kind, ()=>f.content];
    let x = go();
    if (x == null) return null;

    let [X, run] = x


    if (f.tag == "reduce"){
      let E : Kind = ["matrix", f.expect];
      let [df, fn] = f.runner;
      let caster = mkinto(X,E)
      return [f.result, (d )=>(caster(run(d)) as Int32Array).reduce(fn, df)]
    }

    if (f.tag == "move"){
      if (!ismat(x[0])) return null
      let is = i16.map(f.index)
      return [X, x=>is.map(i=>i == -1 ? 0 : x[i])]
    }

    if (f.tag == "binary"){
      let y = go();
      if (y == null) return null;

      let [Y, runy] = y;
      if (ismat(X) || ismat(Y)){

        let mkerx = mkinto(X, ["matrix", f.expect[0]])
        let mkery = mkinto(Y, ["matrix", f.expect[1]])

        return [["matrix", f.result], x=>{
          let xx = mkerx(run(x));
          let yy = mkery(runy(x));
          return Int32Array.from({length:16}, (_,i) => f.runner(xx[i], yy[i]))
        }]
      }
      let mkerx = mkinto(X, f.expect[0])
      let mkery = mkinto(Y, f.expect[0])
      return [f.result, x=>f.runner(mkerx(run(x)) as number, mkery(runy(x)) as number)]
    }
  }

  let E = go();
  if (E == null) return null;
  return x=>({tag:"const", kind: E[0], content: E[1](x.content)})
}






const view = (f:Fun) => {

  if (f.tag == "const"){
    if (ismat(f.kind)){
      return put(view_matrix(f.kind[1], f.content as Int32Array))
    }
    return put(
      div(
        {style: {border: "1px solid #888", width: blockSize}},
        view_scalar(f.kind, f.content as number))
      )
  }
}

const matrix  = (T: ScalarType, data: number[]) : Fun & {content: Raw} => {
  return {
    tag: "const",
    kind: ["matrix", T],
    content: Int32Array.from(data)
  }
}

const binary = (T: ScalarType[], f: (x: number, y: number)=> number) : Fun => {
  if (T.length == 0) T = ["number"];
  if (T.length == 1) T = [T[0], T[0]];
  if (T.length == 2) T = [T[0], T[0], T[1]];
  return {
    tag: "binary",
    expect: [T[0], T[1]],
    result: T[2],
    runner: (x, y) => f(x as number, y as number)
  }
}

const reduce = (T: ScalarType, def:number, f: (x: number, y: number)=> number) : Fun => {
  return {
    tag: "reduce",
    expect: T,
    result: T,
    runner: [def, (x, y) => f(x as number, y as number)]
  }
}

const scalar = (T: ScalarType, x: number) : Fun => {
  return {
    tag: "const",
    kind: T,
    content: x
  }
}


const unary = (T: ScalarType[], f: (x: number)=> number) : Ast[] => {
  if (T.length == 0) T = ["number"];
  if (T.length == 1) T = [T[0], T[0]];
  return [{
    tag: "binary",
    expect: ["number", T[0]],
    result: T[1],
    runner: (_, x) => f(x as number)
  }, scalar("number", 0)]
}

const inc = unary(["number"], (x) => x + 1)
const add2 = binary(["number", "number"], (x, y) => x + y)
const get_color = unary(["color", "color"], (x) => x)
const get_value = unary(["number", "number"], (x) => x)



const move = (index: (i: number) => number) : Fun => ({tag: "move", index})

const move_dir = (dx: number, dy: number) => {
  return move((i) => {
    let x = i % 4 + dx;
    let y = Math.floor(i / 4) + dy;
    if (x < 0 || x > 3 || y < 0 || y > 3) return -1;
    return x + y * 4;
  })
}

const right = move_dir(1, 0)
const left = move_dir(-1, 0)
const up = move_dir(0, -1)
const down = move_dir(0, 1)
const eq = binary(["block", "boolean"], (x, y) => x == y ? 1 : 0)

const or = binary(["boolean"], (x,y) => x || y)
const and = binary(["boolean"], (x,y) => x && y)
const check_id = (kind: ScalarType, id: number) => unary([kind, "boolean"], (x) => x == id ? 1 : 0)
const blue = check_id("color", 3)
const green = check_id("color", 2)
const red = check_id("color", 1)

const all = reduce("boolean", 1, (x: number, y: number) => x && y)
const any = reduce("boolean", 0, (x: number, y: number) => x || y)
const sum = reduce("number", 0, (x,y) => x + y)
const prod = reduce("number", 1, (x,y) => x * y)
const not = unary(["boolean"], x => x == 0 ? 1 : 0)

const add = binary(["number", "number"], (x, y) => x + y)










const n = 0;

let fields = [
  [
    n,n,n,n,
    n,n,1,n,
    n,1,n,n,
    n,n,n,n,
  ],
  [
    n,n,n,n,
    n,4,1,n,
    n,n,n,n,
    n,n,6,n,
  ],
  [
    n,n,n,n,
    n,14,n,n,
    1,2,n,n,
    n,n,n,n,
  ],
].map(f => matrix("block", f) )


let X : Fun = {tag: "source", kind: ["matrix", "block"]}

// const rule = (f:Fun) =>  [any, or, blue, f, green, f]



const rule = (f:Fun) => [not, any, and, get_color, f, eq, get_color, f, right, get_color, f, ]


let RX = wire(rule(X))


const IT = 200000;

function bench(c:(f:Fun) =>Fun){

  let st = performance.now()

  for (let i = 0; i < IT; i++) {
    (c(fields[i % fields.length]))
  }

  let et = performance.now()
  return et - st
}



{
  
  type Ast = {
    tag: "move" | "reduce" | "math" | "scalar" | "source"
    template : (i: number, src:string[]) => string | number
    srcs: Ast[]
  }
  const SRC: Ast = {tag: "source", template: () => "", srcs: []}
  const scalar = (x: number) : Ast => ({tag: "scalar", template: () => x.toString(), srcs: []})




  type Shaped = {
    tag: Ast["tag"],
    template: Ast["template"],
    offset: number,
    ismat: boolean, srcs: Shaped[]}
  let mat_size = 16;
  

  const compile = (buf: Ast) => {
    let ctx = new Map<Ast, number>();
    let lin : Shaped[] = [];

    let tmp_size = mat_size;
    const walk = (buf: Ast) : Shaped => {

      
      if (ctx.has(buf)) return lin[ctx.get(buf)]
      ctx.set(buf, -1);
      let srcs = buf.srcs.map(walk);

      ctx.set(buf, lin.length);
      
      let shaped: Shaped = {
        ...buf,
        ismat:
        buf.tag == "reduce" || buf.tag == "scalar" ? false : buf.tag == "source" || buf.tag == "move" ? true : srcs.some(b=>b.ismat),
        srcs,
        offset: buf.tag == "source" ? 0 : tmp_size,
      }
      if (buf.tag == "source") tmp_size += 0;
      if (shaped.ismat) tmp_size += mat_size;
      else tmp_size += 1;
      lin.push(shaped);
      return shaped;
    }
    walk(buf);

    const code = lin.map((b, i)=> {
      let srcname = b.srcs.map(b=>`L[${b.offset}${b.ismat ? " + i" : ""}]`);
      let Loff = `L[${b.offset}]`;
      if (b.tag == "source") return "";
      if (b.tag == "scalar") return `${Loff} = ${b.template(0, [])};`;
      if (b.tag == "math") {
        if (b.ismat) return `for (let i = 0; i < ${mat_size}; i++) L[${b.offset} + i] = ${b.template(i, srcname)};`
        return `${Loff} = ${b.template(0, srcname)};`;
      }

      if (b.tag == "move") {
        let ret = "";
        for (let i = 0; i < mat_size; i++) {
          let idx = Number(b.template(i, []));
          if (idx > 0 && idx < mat_size) ret += `L[${b.offset + i}] = L[${b.srcs[0].offset + idx}];\n`;
        }
        return ret;
      }
      if (b.tag == "reduce") {
        let ret = "";
        for (let j = 0; j < mat_size; j++) ret = b.template(j, [`L[${b.srcs[0].offset + j}]`, ret]) as string;
        return `${Loff} = ${ret};`
      }
    }).join("\n");

    const array = Int32Array.from({length: tmp_size}, (_, i) => 0);

    console.log(code);

    const func = new Function("L", code);

    return (x: Int32Array) => {
      array.set(x, 0);
      func(array);
      let last = lin[lin.length - 1];
      return Int32Array.from({length: last.ismat ? mat_size : 1}, (_, i) => array[last.offset + i ]);
    }
  }




  const math_ast = (template: (...src:string[]) => string) => (...srcs:Ast[]) : Ast =>  ({tag: "math", template : (_:number, src : string[]) => template(...src), srcs,})

  const cast_scalar = (X: ScalarType, Y: ScalarType) => (x: Ast) : Ast => {

    if (X == Y) return x;
    if (X == "boolean") return x;

    return math_ast((a) => {
      if (Y == "boolean") return `(${a} ? 1 : 0)`
      if (X == "number") {
        if (Y == "color") return `(${a} % 3)`
        if (Y == "block") return `(${a} * 3)`
      }
      if (X == "color") {
        if (Y == "number") return `(${a} % 3)`
        if (Y == "block") return `(${a} * 3)`
      }
      if (X == "block") {
        if (Y == "number") return `(${a} == 0 ? 0 : (${a}+2) / 3)`
        if (Y == "color") return `(${a} == 0 ? 0 : (${a}-1) % 3 + 1)`
      }
    })(x)
  }

  type Fun =
  {
    tag : "move"
    arity: 1,
    ast: (...srcs:Ast[]) => Ast
  } | {
    tag : "math"
    expect: ScalarType
    result: ScalarType
    arity: number
    ast: (...srcs:Ast[]) => Ast
  } | {
    tag : "const"
    arity: 0
    result: ScalarType
    ast: Ast    
  }

  const math = (arity: number,f: (... x: string[]) => string, ...T: ScalarType[]) : Fun => {
    if (T.length == 0) T = ["number"];
    if (T.length == 1) T = [T[0], T[0]];
    return {
      tag: "math",
      expect: T[0],
      result: T[1],
      arity,
      ast: math_ast(f)
    }
  }

  const reduce = (def: number, f: (p: string, acc: string) => string, T: ScalarType = "number") : Fun => {
    return {
      tag: "math",
      expect: T,
      result: T,
      arity: 1,
      ast: (...srcs) => ({
        tag: "reduce",
        template: (i: number, [p, acc]: string[]) => i == 0 ? def : f(p, acc),
        srcs
      })
    }
  }

  const move = (f: (i: number) => number) : Fun => {
    return {
      tag: "move",
      arity: 1,
      ast: (...srcs) => ({
        tag: "move",
        template: f,
        srcs
      })
    }
  }

  const src : Fun = { tag: "const", result: "block", arity: 0, ast: SRC }

  const move_dir = (dx: number, dy: number) => move(i=>{
    let x = i % 4 + dx;
    let y = Math.floor(i / 4) + dy;
    if (x < 0 || x > 3 || y < 0 || y > 3) return -1;
    return x + y * 4;
  })
  const right = move_dir(1, 0)
  const add = math(2, (a,b) => `(${a} + ${b})`, "number", "number", "number")

  const not = math(1, (x) => `(!${x})`, "boolean")

  const any = reduce(0, (x,y) => `(${x} || ${y})`, "boolean")
  const and = math(2, (x,y) => `(${x} && ${y})`, "boolean")
  const eq = math(2, (a,b) => `(${a} == ${b})`,  "block", "boolean")

  const get_color = math(1, x=>x, "color")




  const C = (x: number) : Fun => ({
    tag: "const",
    result: "number",
    arity: 0,
    ast: scalar(x)
  })

  const chain = (...fs: Fun[]) =>{
    let go = () : Fun & {tag: "const"}=> {
      let f = fs.shift();

      if (f.arity == 0) return f as Fun & {tag: "const"}

      if (f == undefined) throw new Error("No function");

      if (f.tag == "move"){
        let src = go();
        return {
          tag: "const",
          result: src.result,
          arity: 0,
          ast: f.ast(src.ast)
        }
      }
      let srcs = Array.from({length: f.arity}, go).map(s=> cast_scalar(s.result, (f as Fun & {expect: ScalarType}).expect)(s.ast));
      return {
        tag: "const",
        result: f.result,
        arity : 0,
        ast: (f as Fun & {tag: "math"}).ast(...srcs)
      }
    }
    return go();
  }

  let fields = [
    [
      n,n,n,n,
      n,n,1,n,
      n,1,n,n,
      n,n,n,n,
    ],
    [
      n,n,n,n,
      n,4,1,n,
      n,n,n,n,
      n,n,6,n,
    ],
    [
      n,n,n,n,
      n,14,n,n,
      1,2,n,n,
      n,n,n,n,
  ]].map(f => Int32Array.from(f))

  const cc = chain(not, any, and, get_color, src, eq, get_color, src, right, get_color, src)
  const F = compile(cc.ast)

  const view_rule = (F: (x: Int32Array) => Int32Array) => {

    fields.forEach(f => {

      put(view_matrix("block", f))
      let ret = F(f);
      if (ret.length == 1) return put(div({style: {border: "1px solid #888", width: blockSize}}, view_scalar(cc.result, ret[0])));
      put(view_matrix(cc.result, ret as Int32Array))
    })
  }


  let st = performance.now();
  for (let i = 0; i < IT; i++) {
    F(fields[i % fields.length])
  }

  let et = performance.now();
  let dt = et - st;
  console.log(`${IT / dt * 1000} rules per second`);

  view_rule(F)



}