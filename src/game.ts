import { button, clear_terminal, div, h2, html, input, p, popup, print, span, table, td, tr } from "./html"
import { Stored, Writable } from "./store";
import {compile, Core, Fun, Lang, mat_size, randchoice, randint, range, DataType, Tensor, TensorType, shape, dtype, ShapeType, check } from "./tensor";


print("game")


const blockSize = "40px";
const colors = ["var(--background)", "red", "green", "#0044FF", "var(--color)"]


const view_scalar = (kind: DataType, num: number)=>{
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

const view_matrix = (dtype: DataType, data: Int32Array) => {
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


const viewdata = (T: TensorType, data: Int32Array) => {
  let [d,s]  = T.split("_") as [DataType, ShapeType];
  if (s == "scalar") return div({style: {border: "1px solid #888", width: blockSize}}, view_scalar(d, data[0]));
  else return view_matrix(d, data);
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
  let [T, F] = compile(rule);
  return p(
    {style: {display: "flex", "flex-wrap": "wrap"}},
    fields.map(f => div(
      {style: {width: `calc(${blockSize} * 4)`}},
      viewdata(T, F(f)))
    ))
}


export let newbar = (...items: any[]) => div({
    tabIndex: 0,
    style: {
      display: "flex", flexDirection: "row",
      border: ".2em solid #888", padding: ".2em",
    }
  }, items.map(i=>blob(i)))

let bar = newbar();

const options = Object.entries(Lang).map(([key])=>key)



type CMD = {
  words: string[]
  current_word: string
}
let command = new Writable<CMD>({words: [], current_word: ""})


let suggestions = (cmd: CMD) =>
  (done(cmd) ?options.filter(k=>Lang[k].length > 0) :options)
  .filter(k =>k.startsWith(cmd.current_word))
  .filter(k => check(print("chec:",[...cmd.words,k]).map(c=>Lang[c])).length > 0)

let done = (cmd: CMD) => cmd.words.length == cmd.words.reduce((a,b)=>a+Lang[b].length, 0) + 1


export const blob = (word: string, style?: Partial<CSSStyleDeclaration>) => span(word, { style: {margin: "0 0.1em", padding: "0.2em", ...style}})

let view_bar = (cm: CMD) =>{

  let {words, current_word} = cm;

  let stack : number[] = []

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
    if (Lang[c].length > 0){
      stack.push(Lang[c].length);
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


let board = div()


function play(level: number){
  print("play", level)
  print(levels[level])
  let code = levels[level]();
  board.innerHTML = "";
  board.append(h2(`level ${level+1}`))
  let R = code.split(" ").map(c=>Lang[c])
  let view_boxes = (T: TensorType, D: Int32Array[]) :HTMLTableCellElement[] =>  D.map(d => td(viewdata(T, d)))
  let view_fun = (T: TensorType, F: (L: Int32Array) => Int32Array) :HTMLTableCellElement[] => view_boxes(T, fields.map(f => F(f)))
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
  let check_fun = usr_fun.map(f=>[Lang.all, Lang._eq, ...R, ...f])

  let check = check_fun.map(f=>{
    let [T, F] = compile(f)
    return fields.map(f=>F(f))
  })

  print("comp:",compile(R)[1](fields[0]))
  let check_all = check.map(c=>c.every(d=>d.every(b=>b == 1)))

  board.append(table(
    row("input", ...view_fun(...compile([Lang.x]))),
    row_promise("output", usr_fun.map(f=>view_fun(...compile(f)))),
    row("expect", ...view_fun(...compile(R))),
    row_promise("check", check.map(c=> view_boxes("boolean_scalar", c))),
    row("all" , td(check_all.map(b=>view_scalar("boolean", Number(b)))))
  ),bar,button("spoiler", {onclick: ()=>popup(div(p(code)))}))
}

let Funs : Map<Fun, string> = new Map(Object.entries(Core).map(([k, v])=>[v, k]))

let FunSizes = new Map<number, string[]>()
Funs.forEach((v, k)=>{FunSizes.set(k.length, [...FunSizes.get(k.length) || [], v])})


type TypeString = `${DataType}_${"scalar" | "matrix"}`

type CoreName = keyof typeof Core;

const all_tensor = new Map<TypeString, Set<CoreName>>()

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
  ()=>`any and x ${sample("direction")} x`,
  // ()=>sample_rule(6).join(" "),
]


levels.forEach((l,i)=>{
  let r = l();
  try{
    compile(r.split(" ").map(c=>Lang[c]))
  }catch(e){
    print("error level ",i,r , e.message)
    print(r.split(" ").map(c=>c + " " + Lang[c].length))
    throw e;
  }
})


export let level = new Stored("level", 0)

level.subscribe(play)

export const Game = div(
  board,
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
  button("Next", {onclick: ()=>level.update(v=>Math.min(v+1, levels.length-1), true)}),
)


