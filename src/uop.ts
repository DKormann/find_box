export type Op0 = "load" | "const"
export type Op1 = "neg" | "inv" | "not"
export type Op2 = "add" | "mul" | "and" | "or" | "eq" | "lt" | "idiv" | "mod" | "sub"
export type Op3 = "ifelse"

export const op1 : Op1[] = ["neg", "inv", "not"]
export const op2 : Op2[] = ["add", "mul", "and", "or", "eq", "lt", "idiv", "mod", "sub"]
export const op3 : Op3[] = ["ifelse"]

export type Op = Op0 | Op1 | Op2 | Op3
export type UOp = {op: Op1 | Op2 | Op3, args: UOp[]} | {op: Op0, arg: number, args: []}

export type mathlike<T> =
  Record<Op0, (n: number) => T>
  & Record<Op1, (x: T) => T>
  & Record<Op2, (x: T, y: T) => T>
  & Record<Op3, (x: T, y: T, z: T) => T>


export const uop : mathlike<UOp> = {
  ...Object.fromEntries([
    ["load", "const"].map((o:Op0)=>[o, (n: number) => ({op: o, arg: n, args:[]})]),
    op1.map((op:Op1)=>[op, (args: UOp) => ({op, args})]),
    op2.map((op:Op2)=>[op, (...args:[UOp, UOp]) => ({op, args:args})]),
  ].flat())
}


export type Schedule = UOp & {uses: number, srcs: Schedule[]}

const schedule = (x:UOp[]): Schedule[] => {
  let cache = new Map<string, number>();
  let li : Schedule[] = [];
  let go = (x:UOp): number => {
    let srcs = x.args.map(go);
    let key = JSON.stringify([x.op, ...srcs])
    if (cache.has(key)) return cache.get(key);
    cache.set(key, cache.size);
    li.push({...x, uses: 0, srcs: srcs.map(i=>li[i])})
    return cache.size -1;
  }
  let ret = x.map(go)
  li.forEach(x=>x.srcs.forEach(s=>s.uses++));
  return ret.map(i=>li[i]);
}

import { compile as compile_js } from "./compilejs";
import { print } from "./html"

export const compile = (x:UOp[]): (L: Int32Array) => Int32Array => compile_js(schedule(x));


