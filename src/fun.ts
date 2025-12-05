import { print } from "./html";
import { mathlike, Op, Op0, op1, op2, Op1, Op2, uop, UOp, compile } from "./uop";

export const mat_size = 16;
export type Buffer = UOp[]
export const range = (i:number) => Array.from({length: i}, (_, k) => k)

const expect = <T> (x:T, predicate: (x:T) => boolean) => {
  if (!predicate(x)) throw new Error(`Expected ${x} to satisfy ${predicate.toString()}`)
  return x
}

const expect_mat = (x:Buffer) => expect(x, x=>x.length == mat_size)

const Buf : mathlike<Buffer> = {
  ...Object.fromEntries([
    ["load", "const"].map((o:Op0)=>[o, (n: number) => [uop[o](n)] as Buffer]),
    op1.map((op:Op1)=>[op, (args: Buffer) => args.map(x=>uop[op](x)) as Buffer]),
    op2.map((op:Op2)=>[op, (...[a,b]:[Buffer, Buffer]) => range(Math.max(a.length, b.length)).map(i=>uop[op](a[i % a.length], b[i % b.length]))]),

  ].flat())
}

const bufif = (c:Buffer, t:Buffer, f:Buffer)=> Buf.add(Buf.mul(c, t), Buf.mul(Buf.not(c), f))

export type DataType = "block" | "color" | "number" | "boolean"
export type ShapeType = "scalar" | "matrix"
export type TensorType = `${DataType}_${ShapeType}`

export type BufferT = {
  buf: Buffer,
  T: TensorType
}

const dtype = (x:BufferT) => x.T.split("_")[0] as DataType
const shape = (x:TensorType) => x.split("_")[1] as ShapeType

const cast = (X: BufferT, T: DataType): BufferT => {
  if (X == null) return null
  let dt = dtype(X);
  if (dt == T) return X;
  if (T == "block") return null;
  let x = X.buf;
  let buf = null;
  if (T == "boolean") buf = Buf.lt(Buf.const(0), X.buf);
  if (dt == "number" && T == "color") buf = bufif(Buf.lt(X.buf, Buf.const(4)), X.buf, Buf.const(4))
  if (dt == "color" && T == "number") buf = X.buf;
  if (dt == "block" && T == "number") buf = bufif(Buf.eq(x, Buf.const(0)), Buf.const(0), Buf.add(Buf.const(1), Buf.idiv(Buf.sub(x, Buf.const(1)), Buf.const(3))));
  if (dt == "block" && T == "color") buf = bufif(Buf.eq(x, Buf.const(0)), Buf.const(0), Buf.add(Buf.const(1), Buf.mod(Buf.sub(x, Buf.const(1)), Buf.const(3))))
  return {buf,T: `${T}_${shape(X.T)}`}
}

export type Fun = (...x:BufferT[]) => BufferT

const dof= (f:(...x:Buffer[]) => Buffer, ...x:BufferT[]) => x.some(x=>x==null) ? null : ({T:x[0].T, buf:f(...x.map(x=>x.buf)) })
const eq:Fun = (a,b) => dtype(a) != dtype(b) ? null : dof(Buf.eq, a,b)

const nhomo = (f: (...x:Buffer[]) => Buffer, d: DataType = "number"): Fun => (...x:BufferT[]) => dof(f, ...x.map(x=>cast(x, d)))

const add = nhomo(Buf.add)
const sub = nhomo(Buf.sub)
const mul = nhomo(Buf.mul)
const idiv = nhomo(Buf.idiv)
const neg = nhomo(Buf.neg)
const not = nhomo(Buf.inv, "boolean")
const and = nhomo(Buf.and, "boolean")
const or = nhomo(Buf.or, "boolean")
const color = nhomo(x=>x, "color")
const boolean = nhomo(x=>x, "boolean")
const number = nhomo(x=>x, "number")
const move = (arg:Buffer, f:(x:number) => number):Buffer => expect_mat(arg).map((x,i)=>{
  let j = f(i);
  return (j < 0 || j >= mat_size) ? [uop.const(0)] : x[j]
})

const reduce = (op:Op2, def:number, T:DataType):Fun => (arg:BufferT) => (arg == null || shape(arg.T) == "scalar") ? null :
  {T: `${T}_scalar`, buf:  [cast(arg, T).buf.reduce((acc,x)=> uop[op](acc,x), uop.const(def))]}

const sum = reduce("add", 0, "number")
const any = reduce("or", 0, "boolean")
const all = reduce("and", 1, "boolean")

const ifelse:Fun = (c,t,f) => (dtype(t) != dtype(f)) ? null : ({buf: bufif(cast(c, "boolean").buf, t.buf, f.buf),
  T: `${dtype(t)}_${shape(t.T) == "matrix" || shape(f.T) == "matrix" ? "matrix" : "scalar"}`})

export const Lang:Record<string, Fun> = {
  add, sub, mul, idiv, neg, not, and, or, color, boolean, number,
  sum, any, all, ifelse,

  x: () => ({T:"block_matrix", buf: range(mat_size).map(i=>uop.load(i))}),
  "0": ()=>({T:"number_scalar", buf: Buf.const(0)}),
  "1": ()=>({T:"number_scalar", buf: Buf.const(1)}),
  "2": ()=>({T:"number_scalar", buf: Buf.const(2)}),
  "3": ()=>({T:"number_scalar", buf: Buf.const(3)}),
}


print(Lang['0']())

print(sum)

print(Lang['1']())

print(neg(Lang['1']()))


let comp = add(Lang['1'](), Lang['2']())

// comp = sum(Lang.x())


print(comp)

print(comp.buf)

let dat = compile(comp.buf)

print(dat)

