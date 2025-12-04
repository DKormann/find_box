import { Op, Op0, Op1, Op2, Op3, UOp, Schedule } from "./uop";


const symbols: Record<Op, string> = {
  add : "($0+$1)", mul : "($0*$1)", and : "($0&&$1)", or : "($0||$1)", eq : "($0==$1)",
  lt : "($0<$1)", idiv : "($0/$1 |0)", inv : "($0^1)", not : "(!$0)", load : "L[$0]",
  const : "$0", ifelse : "($0 ? $1 : $2)", neg : "(-$0)", mod : "($0%$1)"}


export const compile = (x:Schedule[]) => {

  let code = "";

  let seen = new Map<UOp, string>();
  let raster = (x:Schedule) => {
    if (seen.has(x)) return seen.get(x);
    let c = x.srcs.reduce((p, c, i) => p.replaceAll(`$${i}`, raster(c)), symbols[x.op])
    if (x.uses > 1) {
      let name = `x${seen.size}`;
      seen.set(x, name);
      code += `const ${name} = ${c};\n`;
      return name;
    }
    return c;
  }

  let ret = x.map(raster).join(",\n");
  code = code + `return [${ret}];`;
  return Function("L", code) as (L: Int32Array) => Int32Array;
}