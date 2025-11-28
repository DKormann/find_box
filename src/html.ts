import { Writable } from "./store"

export type htmlKey = 'innerText'|'onclick' | 'oninput' | 'onkeydown' |'children'|'class'|'id'|'contentEditable'|'eventListeners'|'color'|'background' | 'style' | 'placeholder'

export const htmlElement = (tag:string, text:string, cls:string = "", args?:Partial<Record<htmlKey, any>>):HTMLElement =>{

  const _element = document.createElement(tag)
  _element.innerText = text
  // if (cls) _element.classList.add(...cls.split('.').filter(x=>x))
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

export const show = (...x:any[])=>{

  const parse = (x: any) => {
    let typ : string = typeof x;
    let ret = span()

    let resetter = (s:string) => p(
      {
        style: {
          fontWeight: "lighter",
          fontSize: "0.8em",
          color: "#888",
          marginRight: "0.5em",
        },
        onclick: () => ret.parentElement.replaceWith(parse(x))
      },
      s
    )

    if (x instanceof Array) {
      typ = "array";
      ret.appendChild(span(
        "[" + x.slice(0,3).map(y=>String(y)).join(",") + (x.length > 3 ? "..." : "") + "]",
        {
          onclick: () => {
            ret.lastChild.replaceWith(div(
              {style: {paddingLeft: "1em",}},
              resetter("["),
              x.map(y=>p(parse(y))),
              resetter("]"),
            ))
            ret.scrollIntoView()
          }
        }
      ))

    }else if (x instanceof HTMLElement){
      typ = "htmlElement";
      ret.appendChild(span(x.tagName, ": ", x.textContent .slice(0,10),))
    }else if (typeof x == 'object') {
      ret.appendChild(span(
        "{" + Object.entries(x).slice(0,3).map(([key, value])=>key + ": " + String(value)).join(", ") + (Object.entries(x).length > 3 ? "..." : "") + "}", 
        {
          onclick: () => {
            ret.lastChild.replaceWith(div(
              {style: {paddingLeft: "1em",}},
              resetter("{"),
              Object.entries(x).map(([key, value])=>p (key + ": ", parse(value))),
              resetter("}"),
            ))
            ret.scrollIntoView()
          }
        }
      ))
    
    }else if (x instanceof Function) {
      ret.appendChild(
        span(String(x),
        {
          onclick: () => {

            const res = div()

            let inps = []
            let win = (div(
              {style: {fontFamily: "monospace"}},
              p(String(x)),
              res,
            ))
            const inp = () => {
              let newinp = (input(
                {
                  onkeydown : (e) => {
                    if (e.key == "Enter"){
                      if (e.metaKey){
                        console.log("meta key")
                        inp()
                      }else{
                        let cll = `x(${inps.map(i=>i.value).join(", ")})`;
                        res.innerHTML = ""
                        try{
                          res.appendChild(p(String(eval(cll))))
                        }catch(e){
                          res.appendChild(p(cll))
                          res.appendChild(p(String(e)))
                        }
                      }
                    }
                  }
                }
              ))
              win.appendChild(p(newinp))
              newinp.focus()
              inps.push(newinp)
            }
            popup(win)
            inp()
          }
        }
      ))

    }else if (typeof x == 'string') {
      typ = "";
      ret = span(x)
    }else {
      ret = span(String(x))
    }
    return span({
      style:{
        "fontFamily": "monospace",
      }},
      span({
        style:{
          fontWeight: "lighter",
          fontSize: "0.8em",
          color: "#888",
          marginRight: "0.5em",
        }
      },
      // typ ? typ + ":" : "",
    ),
    ret
    )
  }

  body.appendChild(p(x.map(parse)))
}


