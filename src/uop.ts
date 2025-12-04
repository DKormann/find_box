import { print } from "./html"


type Op0 = "load" | "const"
type Op1 = "neg" | "inv" | "not"
type Op2 = "add" | "mul" | "and" | "or" | "eq" | "lt" | "idiv" | "mod"
type Op3 = "ifelse"

export const op1 : Op1[] = ["neg", "inv", "not"]
export const op2 : Op2[] = ["add", "mul", "and", "or", "eq", "lt", "idiv", "mod"]
export const op3 : Op3[] = ["ifelse"]

type Op = Op0 | Op1 | Op2 | Op3
export type UOp = {op: Op1 | Op2 | Op3, args: UOp[]} | {op: Op0, arg: number}

export type minimath<T> =
  Record<Op0, (n: number) => T>
  & Record<Op1, (x: T) => T>
  & Record<Op2, (x: T, y: T) => T>
  & Record<Op3, (x: T, y: T, z: T) => T>

export const FULLMATH = <T> (spec: minimath<T>) => ({
  ...spec,
  sub: (x: T, y: T) => spec.add(x, spec.neg(y)),
  or: (x: T, y: T) => spec.not(spec.and(spec.not(x), spec.not(y))),
})

const miniuop : minimath<UOp> = {
  ...Object.fromEntries([
    ["load", "const"].map((o:Op0)=>[o, (n: number) => ({op: o, arg: n}) as UOp]),
    op1.map((op:Op1)=>[op, (args: UOp) => ({op, args})]),
    op2.map((op:Op2)=>[op, (...args:[UOp, UOp]) => ({op, args:args})]),
  ].flat())
}

export const UOp = FULLMATH<UOp>(miniuop)
