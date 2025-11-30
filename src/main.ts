import { clear_terminal, div, h2, html, p, print, span } from "./html"

const doc = div(
  {class: "document",
    style:{
      padding: "1em",
      width: "100%",
      "font-family": "sans-serif",
    }
  }
)

document.body.style.paddingBottom = "200px";
document.body.appendChild(doc)

function put(...el:HTMLElement[]){
  el.forEach(e => doc.append(e))
  return el[0]
}

const blockSize = "40px";
const colors = ["var(--background)", "red", "green", "#0044FF", "var(--color)"]
type ScalarType = "block" | "color" | "number" | "boolean"


const view_scalar = (kind: ScalarType, num: number)=>{
  if (num == null) throw new Error("Null scalar");
  return div(
    {
      style:{
        ... (num != null ? {
          color: colors[kind == "block" ? (num == 0 ? 0 : (num-1) % 3 + 1) : kind == "boolean" ? 2 : 4],
          background: kind == "color" ? colors[num] : colors[0],
        }: {background: colors[0]}),
        width: blockSize, height: blockSize,
        "text-align": "center", "font-size": blockSize, "font-weight": "bold", },
    }, kind == "number" ? num : kind == "block" ? (Math.floor((num + 2) / 3)) : kind == "boolean" ? [num == 0 ? "" : "✓"] : "")
}

const view_matrix = (dtype: ScalarType, data: Int32Array) => {
    return div({style:{
      display: "flex",
      "flex-wrap": "wrap",
      "background": "#111",
      border: "1px solid #888",
      "width": `calc(${blockSize} * 4)`
    }}, 
    Array.from(data).map(x => view_scalar(dtype, x))
  )
}

let mat_size = 16;
const range = (i:number) => Array.from({length: i}, (_, k) => k);
type Atom = { tag: "source", index: number } | { tag: "ALUOp", alu: string, srcs: Atom[] };

type Tensor = {
  tag: "tensor"
  data: Atom[]
  type: ScalarType
}

type Fun
= { tag: "alu", alu: string, expect: ScalarType, result: ScalarType, arity: number }
| { tag: "reduce", alu: string }
| { tag: "move", move: (i: number) => number }
| Tensor


const SRC: Fun = {
  tag: "tensor",
  data: range(mat_size).map(i=> ({tag: "source", index: i})),
  type: "block"
}


const cast_scalar = (X: ScalarType, Y: ScalarType, t: Tensor): Tensor => {

  if (X == Y || X == "boolean") return t;

  let alu: string =
    Y == "boolean" ? "($0 ? 1 : 0)" :
    X == "number" ? (
      Y == "color" ? "$0 == 0 ? 0 : (($0 -1) % 3) + 1" :
      Y == "block" ? "($0 * 3)" :
      "ERR"
    ) :
    X == "color" ? (
      Y == "number" ? "$0" :
      Y == "block" ? "($0 * 3)" :
      "ERR"
    ) :
    X == "block" ? (
      Y == "number" ? "($0 == 0 ? 0 : (($0+2) / 3) | 0)" :
      Y == "color" ? "($0 == 0 ? 0 : ($0-1) % 3 + 1)" :
      "ERR"
    ) :
    "ERR";

  return { tag: "tensor", type: Y, data: t.data.map(x=>({tag: "ALUOp", alu, srcs: [x]}))}
}


const alu = (srcs: Atom[], alu: string): Atom => ({tag: "ALUOp", alu, srcs})
const const_ = (x: number): Atom => ({tag: "ALUOp", alu: x.toString(), srcs: []})


const scalar = (x: number, type: ScalarType): Tensor => ({tag: "tensor", type, data: [const_(x)]})

let app = (f: Fun, x: Tensor[]) : Tensor => {
  if (f.tag == "tensor") return f
  let type = x[0].type;
  let data : Atom[] = [];

  if (f.tag == "alu"){
    x = x.map(x => cast_scalar(x.type, f.expect, x))
    if (f.alu == "$0") return x[0];
    let mat = x.some(x=>x.data.length > 2)
    data = range(mat ? mat_size : 1).map(i=> ({tag: "ALUOp", alu: f.alu, srcs: x.map(x=>x.data[x.data.length > 1 ? i : 0])}))
    type = f.result;
  }
  if (f.tag == "reduce") data = [x[0].data.slice(1).reduce((acc,x)=> alu([acc, x], f.alu), x[0].data[0])]
  if (f.tag == "move") data = range(mat_size).map(f.move).map(i=> (i > 0 )? x[0].data[i] : const_(0))
  return {tag: "tensor", data, type}
}


const alufun = (arity: number, alu : string, ...T: ScalarType[]) : Fun => {
  if (T.length == 0) T = ["number"];
  if (T.length == 1) T = [T[0], T[0]];
  return {
    tag: "alu",
    alu,
    expect: T[0], result: T[1],
    arity
  }
}

const redfun = (alu: string) : Fun => ({tag: "reduce", alu})


const arity = (f: Fun) => f.tag == "alu" ? f.arity : f.tag == "tensor" ? 0 : 1;

const move_dir = (dx: number, dy: number) : Fun => ({tag: "move", move: ((i:number)=>{
  let x = i % 4 + dx;
  let y = Math.floor(i / 4) + dy;
  if (x < 0 || x > 3 || y < 0 || y > 3) return -1;
  return x + y * 4;
})})

const right = move_dir(1, 0)
const left = move_dir(-1, 0)
const up = move_dir(0, -1)
const down = move_dir(0, 1)
const add = alufun(2, "($0 + $1)", "number", "number", "number")
const not = alufun(1, "(!$0)", "boolean")
const any = redfun("($0 || $1)")
const and = alufun(2, "($0 && $1)", "boolean")
const eq = alufun(2, "($0 == $1)", "block", "boolean")
const get_color = alufun(1, "$0", "color")
const get_value = alufun(1, "$0", "number")


const chain = (...fs: Fun[]) : Tensor => {
  let go = () : Tensor => {
    let f = fs.shift();
    if (f.tag == "tensor") return f;
    if (f == undefined) throw new Error("No function");
    let arity = f.tag == "alu" ? f.arity : 1;
    let x = range(arity).map(_ => go());
    return app(f, x);
  }
  return go();
}

const compile = (rule: Fun[]) : [ScalarType, "matrix" | "scalar", (L: Int32Array) => Int32Array] => {
  let t = chain(...rule);

  let lin: Atom[] = [];
  let smap = new Map<string, number>();
  let dedup = (a: Atom) : Atom => {
    let key = "";
    if (a.tag == "source") key = `s${a.index}`;
    else{
      a.srcs = a.srcs.map(dedup)
      key = `${a.alu}(${a.srcs.map(x=>lin.indexOf(x)).join(",")})`
    }
    if (smap.has(key)) return lin[smap.get(key)];
    smap.set(key, lin.length);
    lin.push(a);
    return a;
  }

  t.data.forEach(dedup);
  let usecount = new Map<Atom, number>();
  let count = (atom: Atom) => {
    if (atom.tag == "ALUOp") atom.srcs.forEach(count);
    usecount.set(atom, (usecount.get(atom) || 0) + 1);
  }

  t.data.forEach(count);
  let code = "";
  let seen = new Map<Atom, string>();
  let raster = (atom: Atom) => {
    if (seen.has(atom)) return seen.get(atom);
    let c = atom.tag == "source" ? `L[${atom.index}]` : atom.srcs.reduce((p, c, i) => p.replaceAll(`$${i}`, raster(c)), atom.alu);
    if (usecount.get(atom) > 1) {
      let key = `x${seen.size}`;
      seen.set(atom, key);
      code += `const ${key} = ${c};\n`;
      return key;
    }
    return c;
  }

  let ret = t.data.map(raster).join(",\n");
  code = code + `return [${ret}];`;
  print(code)
  return [t.type, t.data.length == 1 ? "scalar" : "matrix", new Function("L", code) as (L: Int32Array) => Int32Array]
}

compile([add, SRC, SRC])

const viewdata = (T: ScalarType, S: "scalar" | "matrix", data: Int32Array) => {
  if (S == "scalar") return div({style: {border: "1px solid #888", width: blockSize}}, view_scalar(T, data[0]));
  else return view_matrix(T, data);
}


let n = 0;
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
    1,2,3,n,
    4,5,6,n,
]].map(f => Int32Array.from(f))


const view_rule = (rule: Fun[]) => {
  let [T, S, F] = compile(rule);
  return put(p(
    {style: {display: "flex", "flex-wrap": "wrap"}},
    fields.map(f => viewdata(T,S, F(f)))))
}


const rule = [not, any, and, get_color, SRC, eq, get_color, SRC, right, get_color, SRC]


const is_color = (x: number): Fun => ({tag: "alu", alu: `($0 == ${x})`, expect: "color", result: "boolean", arity: 1})

const isred = is_color(1)
const isgreen = is_color(2)
const isblue = is_color(3)




const [T, S, F] = compile(rule)



const bench = ()=>{

  const IT = 200000;
  let st = performance.now();
  for (let i = 0; i < IT; i++) {
    F(fields[i % fields.length])
  }
  
  
  let et = performance.now();
  let dt = et - st;
  print(`${Math.round(IT / dt)} k rules per second`);
}



view_rule([SRC])




{ // create rule search

  let bar = div(

    {
      tabIndex: 0,
      style: {
        display: "flex",
        flexDirection: "row",

        border: ".2em solid #888",
        padding: ".2em",
      }
    })

  bar.focus()



  let Lang = {
    x: SRC,
    right, left, up, down,
    eq,
    color: get_color,
    number: get_value,
    bool: alufun(1, "$0", "boolean"),
    block: alufun(2, "$0 == 0 ? 0 : ($0*3)-2 + $1 -1", "number", "block"),
    isred,
    isgreen,
    isblue,
    any,
    sum: redfun("($0 + $1)"),
    product: redfun("$0 * $1"),
    and,
    not,
    add,
    mul: alufun(2, "$0 * $1", "number", "number"),
    "0": scalar(0, "number"),
    "1": scalar(1, "number"),
    "2": scalar(2, "number"),
    "3": scalar(3, "number"),
    red : scalar(1, "color"),
    green : scalar(2, "color"),
    blue : scalar(3, "color"),
  }

  let cmd : string[] = ["eq", "eq", "x"]

  let cmd_idx = 0;

  let current_word = "";

  const options = Object.entries(Lang).map(([key])=>key)
  let suggestions : string[] = options;

  let stack : number[] = []


  let outp : HTMLElement = div()


  let done = false;

  let view_bar = () =>{
    const blob = (word: string, style?: Partial<CSSStyleDeclaration>) => span(word, { style: {margin: "0 0.1em", padding: "0.2em", ...style}})

    const push = (word: string) => bar.append(blob(word))

    done = cmd.length == cmd.reduce((a,b)=>a+arity(Lang[b]), 0) + 1;


    const usr = div(
      {style: {position: "relative", margin: "0", padding: "0", marginTop: "0.2em",}},
      blob(current_word ? current_word : "", {background: "var(--color)", color: "var(--background)"}),
      (!done || current_word) ? div(
        {style: {position: "absolute", top: "100%", left: "0", display: "flex", flexDirection: "column", zIndex: "1000",border: "1px solid #888", background: "var(--background)"}},
        suggestions.map(k => span(
          k,
          {
            style: {padding: "0.2em", cursor: "pointer"},
            onclick: ()=> {
              add_cmd(k)
              view_bar()
            }
          }
        )),

      ) : null,
    )

    bar.innerHTML = "";
    push("x → ")

    stack = []

    if (done) bar.append(usr)

    cmd.forEach(c=>{
      push(c)
      stack[stack.length - 1]--;
      if (arity(Lang[c]) > 0){
        stack.push(arity(Lang[c]));
        push("(")
      } else {
        while (stack[stack.length - 1] == 0){
          stack.pop()
          push(")")
        }
      }
    })

    if (!done) bar.append(usr)

    stack.reverse().forEach(n=>{
      range(n).forEach(()=>push("..."))
      push(")")
    })

    outp.remove()

    if(done) outp = (view_rule([...cmd.map(c=>Lang[c])]))
  }

  view_bar()

  const add_cmd = (c:string) => {
    
    if (done) cmd = [c, ...cmd]
    else cmd.push(c);

    current_word = "";
    suggestions = options;
  }

  bar.addEventListener("keydown", (e)=>{

    if (e.key == "ArrowRight"){
      cmd_idx++;
    }

    if (e.key == "ArrowLeft") cmd_idx--;

    if (e.key == "Backspace"){
      if (e.shiftKey) cmd.shift();
      else{
        if (current_word.length > 0) current_word = ""
        else cmd.pop();
      }
    }

    if (e.key == " "){
      add_cmd(suggestions[0])
    } else if (e.key.length == 1){
      current_word += e.key;
    }


    suggestions = options.filter(k => k.startsWith(current_word))

    if (suggestions.length == 1){
      add_cmd(suggestions[0])
    }
    if (suggestions.length == 0){
      current_word = current_word.slice(0, -1);
      suggestions = options;
    }
    
    while (true){
      let nl = suggestions.map(k=>k.slice(current_word.length, current_word.length + 1))
      if (nl.some(k => k != nl[0])) break;
      current_word += nl[0];
    }

    view_bar()

  })

  put(bar)

  bar.focus()


}