import { button, clear_terminal, div, h2, html, input, p, popup, print, span, table, td, tr } from "./html"
import { Stored, Writable } from "./store";

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
= { tag: "alu", reduce: boolean, alu: string, expect: ScalarType, result: ScalarType, arity: number}
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
      Y == "color" ? "$0 > 3 ? 4 : $0" :
      Y == "block" ? "$0 == 0 ? 0 : ($0 * 3) - 2" :
      "ERR"
    ) :
    X == "color" ? (
      Y == "number" ? "$0" :
      Y == "block" ? "$0" :
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
    if (f.reduce) data = [x[0].data.slice(1).reduce((acc,x)=> alu([acc, x], f.alu), x[0].data[0])]
    else data = range(mat ? mat_size : 1).map(i=> ({tag: "ALUOp", alu: f.alu, srcs: x.map(x=>x.data[x.data.length > 1 ? i : 0])}))
    type = f.result;
  }
  // if (f.tag == "reduce") data = [x[0].data.slice(1).reduce((acc,x)=> alu([acc, x], f.alu), x[0].data[0])]
  if (f.tag == "move") data = range(mat_size).map(f.move).map(i=> (i > 0 )? x[0].data[i] : const_(0))
  return {tag: "tensor", data, type}
}


const alufun = (arity: number, alu : string, ...T: ScalarType[]) : Fun => {
  if (T.length == 0) T = ["number"];
  if (T.length == 1) T = [T[0], T[0]];
  return {
    tag: "alu",
    reduce: false,
    alu,
    expect: T[0], result: T[1],
    arity
  }
}

const redfun = (alu: string, result: ScalarType) : Fun => ({tag: "alu", reduce: true, alu, expect: result, result, arity: 1})


const arity = (f: Fun) => f.tag == "alu" ? f.arity : f.tag == "tensor" ? 0 : 1;

const move_dir = (dx: number, dy: number) : Fun => ({tag: "move", move: ((i:number)=>{
  let x = i % 4 + dx;
  let y = Math.floor(i / 4) + dy;
  if (x < 0 || x > 3 || y < 0 || y > 3) return -1;
  return x + y * 4;
})})



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
    if (usecount.get(atom) > 0) {
      let key = `x${seen.size}`;
      seen.set(atom, key);
      code += `const ${key} = ${c};\n`;
      return key;
    }
    return c;
  }

  let ret = t.data.map(raster).join(",\n");
  code = code + `return [${ret}];`;

  return [t.type, t.data.length == 1 ? "scalar" : "matrix", new Function("L", code) as (L: Int32Array) => Int32Array]
}


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
  return p(
    {style: {display: "flex", "flex-wrap": "wrap"}},
    fields.map(f => div(
      {style: {width: `calc(${blockSize} * 4)`}},
      viewdata(T,S, F(f)))
    ))
}
const is_color = (x: number): Fun => alufun(1, `($0 == ${x})`, "color", "boolean")
view_rule([SRC])

let bar = div({
    tabIndex: 0,
    style: {
      display: "flex", flexDirection: "row",
      border: ".2em solid #888", padding: ".2em",
    }
  })




let Core : Record<string, Fun> = {



  number: alufun(1, "$0", "number"),
  isred: is_color(1),
  isgreen: is_color(2),
  isblue: is_color(3),
  any: redfun("($0 || $1)", "boolean"),
  sum: redfun("($0 + $1)", "number"),
  not: alufun(1, "(!$0)", "boolean"),
  
  and: alufun(2, "($0 && $1)", "boolean"),
  eq: alufun(2, "($0 == $1)", "block", "boolean"),
  add: alufun(2, "($0 + $1)", "number", "number"),

  "0": scalar(0, "number"),
  "1": scalar(1, "number"),
  "2": scalar(2, "number"),
  "3": scalar(3, "number"),
  x: SRC,
}


let Lang : Record<string, Fun> = {
  ...Core,

  right: move_dir(1, 0),
  up: move_dir(0, -1),


  left: move_dir(-1, 0),
  down: move_dir(0, 1),

  color: alufun(1, "$0", "color"),
  block: alufun(2, "$0 == 0 ? 0 : ($0*3)-2 + $1 -1", "number", "block"),
  asblock: alufun(1, "$0" , "block"),
  all: redfun("($0 && $1)", "boolean"),
  product: redfun("($0 * $1 | 0)", "number"),
  or: alufun(2, "($0 || $1)", "boolean"),
  mul: alufun(2, "$0 * $1", "number", "number"),
  red : scalar(1, "color"),
  green : scalar(2, "color"),
  blue : scalar(3, "color"),
}

{
  const rule = "not any and color x eq color x right color x".split(" ").map(c=>Lang[c])
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
  // bench()
}

const options = Object.entries(Lang).map(([key])=>key)



type CMD = {
  words: string[]
  current_word: string
}
let command = new Writable<CMD>({words: [], current_word: ""})


let suggestions = (cmd: CMD) =>
  (done(cmd) ?options.filter(k=>arity(Lang[k]) > 0) :options)
  .filter(k =>k.startsWith(cmd.current_word))

let done = (cmd: CMD) => cmd.words.length == cmd.words.reduce((a,b)=>a+arity(Lang[b]), 0) + 1



let view_bar = (cm: CMD) =>{

  let {words, current_word} = cm;

  let stack : number[] = []
  const blob = (word: string, style?: Partial<CSSStyleDeclaration>) => span(word, { style: {margin: "0 0.1em", padding: "0.2em", ...style}})

  const push = (word: string) => bar.append(blob(word))

  const usr = div(
    {style: {position: "relative", margin: "0", padding: "0", marginTop: "0.2em",}},
    blob(current_word ? current_word : "", {background: "var(--color)", color: "var(--background)"}),
    (!done(cm) || current_word) ? div(
      {style: {position: "absolute", top: "100%", left: "0", display: "flex", flexDirection: "column", zIndex: "1000",border: "1px solid #888", background: "var(--background)"}},
      suggestions(cm).map(k => span(
        k,
        {
          style: {padding: "0.2em", cursor: "pointer"},
          onclick: ()=> add_cmd(k)
        }
      )),

    ) : null,
  )

  bar.innerHTML = "";
  push("x → ")

  stack = []

  if (done(cm)) bar.append(usr)

  words.forEach(c=>{
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

  if (!done(cm)) bar.append(usr)

  stack.reverse().forEach(n=>{
    range(n).forEach(()=>push("..."))
    push(")")
  })
}


const add_cmd = (c:string) => {

  command.update(cm=>({
    words: done(cm) ? [c, ...cm.words] : [...cm.words, c],
    current_word: ""
  }))
}

command.subscribe(cm=>{
  view_bar(cm)
})

document.addEventListener("keydown", (e)=>{
  

  if (e.key == "Backspace"){
    command.update(cm=>{
      if (e.shiftKey) return {words: cm.words.slice(1), current_word: cm.current_word}
      else{
        if (cm.current_word.length > 0) return {words: cm.words, current_word: ""}
        else return {words: cm.words.slice(0, -1), current_word: cm.current_word}
      }
    })
    return;
  }

  command.update(cm=>{


    let sug = suggestions(cm)
    let don = done(cm)

    const add_word = (w: string) =>{
      cm.words = don ? [w, ...cm.words] : [...cm.words, w];
      cm.current_word = "";
    }

    if (e.key.length == 1){
      if (e.key == " "){
        add_word(sug[0])
      }else{
        cm.current_word += e.key;
      }
    }

    sug = suggestions(cm)

    if (sug.length == 1){
      add_word(sug[0])
    }
    
    else if (sug.length == 0) cm.current_word = cm.current_word.slice(0, -1);
    else {

      while (true){
        let nl = sug.map(k=>k.slice(cm.current_word.length, cm.current_word.length + 1))
        if (nl.some(k => k != nl[0])) break;
        cm.current_word += nl[0];
      }
    }
    return cm;
  }, true)

})





fields = []



const sample = (t: string) => {

  if (t == "number") return Math.floor(Math.random() * 3) + 1;
  if (t == "color") return ["red", "green", "blue"][Math.floor(Math.random() * 3)];
  if (t == "boolean") return Math.random() < 0.5 ? 0 : 1;
  if (t == "block") return Math.floor(Math.random() * 9) + 1;
  if (t == "direction") return ["right", "left", "up", "down"][Math.floor(Math.random() * 4)];

}


for (let i = 0; i < 16; i++) {

  let f = Int32Array.from({length: 16}, (_, k) => k == i ? 1 : 0)
  for (let j = 0; j < Math.floor(Math.random() * 3) + 2; j++) {
    f[Math.floor(Math.random() * 16)] = sample("block") as number;
  }
  fields.push(f);
}


let game = div()
put(game)

function play(level: number){
  let code = levels[level]();
  game.innerHTML = "";
  game.append(h2(`level ${level+1}`))
  let R = code.split(" ").map(c=>Lang[c])
  let view_boxes = (T: ScalarType, S: "scalar" | "matrix", D: Int32Array[]) :HTMLTableCellElement[] =>  D.map(d => td(viewdata(T, S, d)))
  let view_fun = (T: ScalarType, S: "scalar" | "matrix", F: (L: Int32Array) => Int32Array) :HTMLTableCellElement[] => view_boxes(T, S, fields.map(f => F(f)))
  let row = (title: string, ...data: any[]) => tr(td(title), ...data)

  let row_promise = (title: string, promise: Writable<HTMLTableCellElement[]>) => {
    let el = tr();
    promise.subscribe(data=>{
      el.innerHTML = "";
      el.append(td(title), ...data)
    })
    return el;
  }
  let usr_fun = new Writable<Fun[]>(null)

  command.subscribe(cm=>{
    if (!done(cm)) return;
    usr_fun.set(cm.words.map(c=>Lang[c]))
  })
  let check_fun = usr_fun.map(f=>[Lang.all, Lang.eq, ...R, ...f])

  let check = check_fun.map(f=>{
    let [T, S, F] = compile(f)
    return fields.map(f=>F(f))
  })

  print("comp:",compile(R)[2](fields[0]))

  let check_all = check.map(c=>c.every(d=>d.every(b=>b == 1)))

  game.append(table(
    row("input", ...view_fun(...compile([SRC]))),
    row_promise("output", usr_fun.map(f=>view_fun(...compile(f)))),
    row("expect", ...view_fun(...compile(R))),
    row_promise("check", check.map(c=> view_boxes("boolean", "scalar", c))),
    row("all", td(check_all.map(b=>view_scalar("boolean", Number(b)))))
  ),bar,button("spoiler", {onclick: ()=>popup(div(p(code)))}))
}

let Funs : Map<Fun, string> = new Map(Object.entries(Core).map(([k, v])=>[v, k]))

let FunSizes = new Map<number, string[]>()
Funs.forEach((v, k)=>{FunSizes.set(arity(k), [...FunSizes.get(arity(k)) || [], v])})

const sample_word = (a: number) =>  FunSizes.get(a)[Math.floor(Math.random() * FunSizes.get(a).length)]
const randint = (min: number, max: number) => Math.floor(Math.random() * (max - min) + 0.99) + min

const _sample_rule = (size: number) : string[] => {


  if (Math.random() < 0.1) size --;
  if (size < 2) return [sample_word(0)];
  if (size == 2) return [sample_word(1), sample_word(0)];
  if (Math.random() < 0.6){
    return [sample_word(1), ..._sample_rule(size -1)]
  }
  let s1 = randint(1, size-2)
  let s2 = size - 1 - s1
  return [sample_word(2), ..._sample_rule(s1), ..._sample_rule(s2)]
}


const sample_rule = (size: number) => {

  let res = ["any", ..._sample_rule(size)]
  let [T, S, F] = compile(res.map(w=>Lang[w]))
  let y = fields.map(f=>F(f)[0])

  if (y.some(d=>d != y[0])) {
    return res
  };
  

  return sample_rule(size)
}

let levels = [

  ()=>`number x`,
  ()=>`color x`,
  ()=>`sum x`,
  ()=>`${sample("direction")} x`,
  ()=>`add 1 x`,
  ()=>`mul 2 x`,

  ()=>`isblue color x`,
  ()=>`isred color x`,
  ()=>`isgreen color x`,
  ()=>`eq ${sample("number")} number x`,
  ()=>`eq ${sample("number")} number x`,
  ()=>`any eq ${sample("color")} color x`,
  ()=>`any eq ${sample("color")} color x`,
  ()=>`any eq ${sample("number")} number x`,
  ()=>`any eq ${sample("number")} number x`,
  ()=>`any or eq ${sample("color")} color x eq ${sample("number")} number x`,
  ()=>`any and x eq number x ${sample("number")}`,
  ()=>`any and x ${sample("direction")} x`,
  ()=>sample_rule(3).join(" "),
]


levels.forEach(l=>{
  try{
    compile(l().split(" ").map(c=>Lang[c]))
  }catch(e){
    print("error",l , e.message)
  }
})


let level = new Stored("level", 0)


level.subscribe(play)


put(
  button(
    "Levels",
    {
      onclick: e=>{

        let pop = popup(div(
          levels.map((l,i)=>p(
            {
              onclick: e=>{
                level.set(i)
                pop.remove()
              },
              style: {cursor: "pointer"},
            },
            `level ${i+1}`)
          ),
          p(
            "random",
            { onclick: ()=>{level.set(levels.length - 1, true), pop.remove()}, style: {cursor: "pointer"},}
          )
        ))
      }
    }
  ),
  button("Next", {onclick: ()=>level.update(v=>v+1)}),

)


