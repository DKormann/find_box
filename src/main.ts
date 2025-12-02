import { Game, level, newbar } from "./game";
import { background, border, button, div, h2, html, p, padding, popup, style, width } from "./html";
import { Stored } from "./store";




const first_time = new Stored("first_time_player", true)

first_time.then(v=>{
  if (v) {

    let tut = popup(div(
      style({textAlign: "center"}),
      h2("Welcome to the game"),
      p("This game is about finding the right rule to solve the level."),
      p("the first levels show usage of some of the important keywords that define what a rule is."),
      p("later on the levels get more creative "),
      p("you can use the spoiler button to see the solution for the level."),
      p("the input row shows the data coming in."),
      p("the \"expect\" row shows what the right rule should output."),
      p("the \"output\" row shows what your rule should output."),
      p("the input bar looks like this: "),

      newbar("x → "),
      p("here you can try to enter your rule. the autocomplete is pretty agressive to prevent you from typing impossible rules."),
      p(button("first level", {onclick: ()=>{level.set(0); tut.remove()}})),

      p(button("ok", {onclick: ()=>{tut.remove()}})),
      p(button("dont show again", {onclick: ()=>{first_time.set(false); tut.remove()}}))
    ))
    tut.style.zIndex = "2000";
  }

  return true
})




document.body.appendChild(
  div(
    padding("1em"),
    Game
  )
)

