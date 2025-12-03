import { Stored, Writable } from "./store"

export type htmlKey = 'innerText'|'onclick' | 'oninput' | 'onkeydown' |'children'|'class'|'id'|'contentEditable'|'eventListeners'|'color'|'background' | 'style' | 'placeholder' | 'tabIndex' | 'colSpan'

export const htmlElement = (tag:string, text:string, cls:string = "", args?:Partial<Record<htmlKey, any>>):HTMLElement =>{

  const _element = document.createElement(tag)
  _element.innerText = text
  if (args) Object.entries(args).forEach(([key, value])=>{
    if (key === 'parent'){
      (value as HTMLElement).appendChild(_element)
    }
    if (key==='children'){
      (value as HTMLElement[]).forEach(c=>_element.appendChild(c))
    }else if (key==='eventListeners'){
      Object.entries(value as Record<string, (e:Event)=>void>).forEach(([event, listener])=>{
        _element.addEventListener(event, listener)
      })
    }else if (key === 'color' || key === 'background'){
      _element.style[key] = value
    }else if (key === 'style'){
      Object.entries(value as Record<string, string>).forEach(([key, value])=>{

        key = key.replace(/([A-Z])/g, '-$1').toLowerCase();
        _element.style.setProperty(key, value)
      })
    }else if (key === 'class'){
      _element.classList.add(...(value as string).split('.').filter(x=>x))
    }else{
      _element[(key as 'innerText' | 'onclick' | 'oninput' | 'id' | 'contentEditable')] = value
    }
  })
  return _element
}




type HTMLArg = string | number | HTMLElement | Partial<Record<htmlKey, any>> | Writable<any> | Promise<HTMLArg> | HTMLArg[]


export const html = (tag:string, ...cs:HTMLArg[]):HTMLElement=>{
  let children: HTMLElement[] = []
  let args: Partial<Record<htmlKey, any>> = {}

  const add_arg = (arg:HTMLArg)=>{
    if (typeof arg === 'string') children.push(htmlElement("span", arg))
    else if (typeof arg === 'number') children.push(htmlElement("span", arg.toString()))
    else if (arg instanceof Writable){
      const el = span({class:"writable-container"})
      arg.subscribe((value)=>{
        el.innerHTML = ""
        el.appendChild(span(value, {class:"writable-value"}))
      })
      children.push(el)
    }
    else if (arg instanceof Promise){
      const el = span()
      arg.then((value)=>{
        el.innerHTML = ""
        el.appendChild(span(value))
      })
      children.push(el)
    }
    else if (arg instanceof HTMLElement) children.push(arg)
    else if (arg instanceof Array) arg.forEach(add_arg)
    else args = {...args, ...arg}
  }
  for (let arg of cs){
    add_arg(arg)
  }
  return htmlElement(tag, "", "", {...args, children})
}


export type HTMLGenerator<T extends HTMLElement = HTMLElement> = (...cs:HTMLArg[]) => T

const newHtmlGenerator = <T extends HTMLElement>(tag:string)=>(...cs:HTMLArg[]):T=>html(tag, ...cs) as T



export const p:HTMLGenerator<HTMLParagraphElement> = newHtmlGenerator("p")
export const h1:HTMLGenerator<HTMLHeadingElement> = newHtmlGenerator("h1")
export const h2:HTMLGenerator<HTMLHeadingElement> = newHtmlGenerator("h2")
export const h3:HTMLGenerator<HTMLHeadingElement> = newHtmlGenerator("h3")
export const h4:HTMLGenerator<HTMLHeadingElement> = newHtmlGenerator("h4")

export const div:HTMLGenerator<HTMLDivElement> = newHtmlGenerator("div")
export const button:HTMLGenerator<HTMLButtonElement> = newHtmlGenerator("button")
export const span:HTMLGenerator<HTMLSpanElement> = newHtmlGenerator("span")
export const textarea:HTMLGenerator<HTMLTextAreaElement> = newHtmlGenerator("textarea")

export const table:HTMLGenerator<HTMLTableElement> = newHtmlGenerator("table")
export const tr:HTMLGenerator<HTMLTableRowElement> = newHtmlGenerator("tr")
export const td:HTMLGenerator<HTMLTableCellElement> = newHtmlGenerator("td")
export const th:HTMLGenerator<HTMLTableCellElement> = newHtmlGenerator("th")

export const style = (...rules: Record<string, string>[]) => {
  return {style: Object.assign({}, ...rules)}
}

export const margin = (value: string) => style({margin: value})
export const padding = (value: string) => style({padding: value})
export const border = (value: string) => style({border: value})
export const borderRadius = (value: string) => style({borderRadius: value})
export const width = (value: string) => style({width: value})
export const height = (value: string) => style({height: value})
export const display = (value: string) => style({display: value})
export const color = (value: string = "var(--color)") => style({color: value})
export const background = (value: string = "var(--background)") => style({background: value})

export const input:HTMLGenerator<HTMLInputElement> = (...cs)=>{

  const writable = cs.find(c=>c instanceof Writable) as Writable<string>

  const content = cs.filter(c=>typeof c == 'string').join(' ')

  const el = html("input", ...cs) as HTMLInputElement

  if (writable){
    writable.subscribe(v=>{
      if (el.value!=v.toString()){
        el.value = v.toString()
      }
    });

    el.onkeydown = (e)=>{
      if (e.key == "Enter"){
        writable.set(el.value)
      }
    }

  }else{
    el.value = content
  }
  return el
}



export const popup = (...cs:HTMLArg[])=>{

  const dialogfield = div(
    {
      style: {
        background: "var(--background)",
        color: "var(--color)",
        padding: "1em",
        paddingBottom: "2em",
        borderRadius: "1em",
      }
    },
    ...cs)

  const popupbackground = div(
    {style:{
      position: "fixed",
      top: "0",
      left: "0",
      width: "100%",
      height: "100%",
      background: "rgba(166, 166, 166, 0.5)",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
    }}
  )

  popupbackground.appendChild(dialogfield);
  document.body.appendChild(popupbackground);
  popupbackground.onclick = () => {
    popupbackground.remove();
  }




  dialogfield.onclick = (e) => {
    e.stopPropagation();
  }

  return popupbackground

}


const body = document.body;


const typ = (x:any): string => {
  if (x instanceof Array) return "array"
  if (x == null) return "null"
  if (x == undefined) return "undefined"
  else if (x instanceof Function) return "function"
  else if (x instanceof HTMLElement) return "htmlElement"

  else if (x instanceof Object) {
    let keys = Object.keys(x);
    // if (keys.length == 2 && keys.includes("tag") && keys.includes("args")) return "repr";
    return "object"}
  else return typeof x
}

const brackets = (typ: string): [string, string] => {
  if (typ == "array") return ["[", "]"]
  else if (typ == "object") return ["{", "}"]
  else if (typ == "function") return ["Function(", ")"]
  else if (typ == "htmlElement") return ["<", "/>"]
  else return ["", ""]
}

const preview = (x:any) : HTMLElement=> {

  let size = 40;
  let t = typ(x);

  let inner = t == "array" ? x.slice(0,10).toString() :
  t == "function" ? x.toString() :
  t == "htmlElement" ? (x.tagName + x.textContent) :
  t == "object" ? Object.entries(x).slice(0,3).map(([key, value])=>key + ": " + String(value)).join(", ") :
  // t == "repr" ? `${x.tag}(${Object.entries(x.args).map(([key, value])=>key + " = " + String(value)).join(", ")})` :
  String(x)

  if (t != "string") inner = inner.replaceAll("\n", "")
  let ret = span(

    {
      style: {marginLeft: "0.5em"},
      onclick: brackets(t)[0] != "" ?
      ()=>{
        ret.replaceWith(full_view(x))
      } : undefined
    },
    `${brackets(t)[0]}${inner}${brackets(t)[1]}`) 
  return ret
}


const full_view = (x:any): HTMLElement => {
  let t = typ(x);
  let bracks = brackets(t);
  let ret = div();
  let closers = bracks.map(b => p(b,{onclick: ()=>{ret.replaceWith(preview(x))}}));
  ret.replaceChildren(
    closers[0],
    div(
      {style: {paddingLeft: "1em"}},
      t == "array" ? x.map((v:any) => p(preview(v))) :
      t == "repr" ? p(x.tag + "(" , Object.entries(x.args).map(([key, value])=>p(key + " = ", preview(value))), ")") :
      t == "object" ? Object.entries(x).map(([key, value])=>p(key + ": ", preview(value))) :
      t == "function" ? [p(x.toString()), p(button("run", {onclick: ()=>{

        let inputs = div({style: {display: "flex", flexDirection: "column", gap: "0.5em"}});
        let res = div();

        let run = ()=>{
          let args = Array.from(inputs.childNodes).map((inp: HTMLInputElement)=>inp.value);
          res.innerHTML = "";
          let ret= x(...args.map(eval))
          print("run result:", ret)

          res.append(preview(ret), p())
        }

        
        let mkinput = ()=>{
          inputs.appendChild(input(
            {
              onkeydown: (e)=>{
                if (e.key == "Enter"){
                  if (e.metaKey){
                    mkinput()
                  }else{
                    run()
                  }
                }
              }
            }
          ))
        }
        mkinput()
        popup(div(
          p(x.toString()),
          res,
          inputs
        ))
      }}))]:
      []
    ),
    closers[1]);
  return ret;


}

const termline = (tag:string, content): HTMLElement => {
  return p(

    span(
      {
        style: {
          background,
          position: "relative",
          color: "#aaa",
          padding: "0",
          margin: "0",

        }
      },
      tag
    ),
    
    
    {style: {margin: ".5em 1em .5em 1em", paddingBottom: "0.5em", fontFamily: "monospace", cursor: "pointer", whiteSpace: "pre-wrap", fontSize: "0.92em", borderBottom: "1px solid #aaa"}}, content)
}

let logger = null;
let terminal_input = null;



export const clear_terminal = () => {
  logger.innerHTML = ""
}


let out : any[] = [];
let hist = new Stored("terminal_hist", []);
let inp : string[] = [];

hist.subscribe(h=>inp = h);



const create_terminal = ()=>{

  let terminal = div({style: {
    position: "fixed",
    top: "0",
    right: "0",
    width: "50%",
    height: "100%",
    border: "1px solid #888",
    borderRadius: "1em",
    background : "var(--background)",
    overflowY: "scroll",
    zIndex: "1000",

  }})

  let sidemove = false;
  let sidebar = div({
    style: {
      height: "100%",
      width: "1em",
      position: "absolute",
      left: "0em",
      top: "0em",
      cursor: "ew-resize",
    },
  })

  sidebar.addEventListener("mousedown", (e)=>{
    sidemove = true;
    e.preventDefault()
  })

  let terminal_width = new Stored("terminal_width", 50);
  terminal_width.subscribe((value)=>{
    terminal.style.width = Math.max(2,value) + "%";
  })

  document.addEventListener("mousemove", (e)=>{
    if (sidemove){
      terminal_width.update(v=> (window.innerWidth - e.clientX) / window.innerWidth * 100);
      e.preventDefault()
    }
  })
  document.addEventListener("mouseup", (e)=> sidemove = false)


  let content = div({style: {
    height: "100%",
    width: "100%",
    overflowY: "scroll",
  }})

  terminal.append(sidebar,content)    
  let showterm = new Stored("showterm", false)
  showterm.subscribe((value)=> terminal.style.display = value ? "block" : "none")

  document.addEventListener("keydown", (e)=>{
    if (e.metaKey){

      if (e.key == "b"){
        showterm.update(v=>!v);
        e.preventDefault()
      }
      if (e.key == "l" || e.key == "k"){
        logger.innerHTML = ""
        e.preventDefault()
      }
    }
  })

  body.appendChild(terminal)
  logger = div()

  let hist_pos = 0;

  terminal_input = input(
    {style: {all: "unset", width: "100%", border: "none", padding: "0.5em"},
    placeholder: ">>>",
    onkeydown: (e)=>{
      if (e.key == "Enter"){
        e.preventDefault();
        e.stopPropagation();
        let val = terminal_input.value.trim();
        if (val == "") return;
        try{
          hist.update(h=>[...h, val].slice(-100));
          logger.append(termline(`inp[${inp.length-1}]: `, val))
          print(eval(val))
        }
        catch(e){
          logger.append(termline("error:", e.message))
          throw e;
        }
        finally{
          terminal_input.value = ""
        }

        terminal_input.focus()
        terminal_input.scrollIntoView({behavior: "instant", block: "end", inline: "nearest"})
      }
      if (e.key == "ArrowUp"){
        hist_pos -= 1;
        terminal_input.value = inp[Math.max(0, inp.length + hist_pos)];
      }else{
        hist_pos = 0;
      }
    }
  })

  content.append(logger, terminal_input)
}

export type repr = {tag: string, args: Record<string, any>}

export const print = (...x:any[])=>{

  out.push(...x);
  if (logger == null)create_terminal();
  const tl = termline(`out[${out.length-1}]: `, x.map(preview));

  logger.appendChild(tl)
  terminal_input.scrollIntoView({ block: "end"})
  return x[x.length-1];
}





