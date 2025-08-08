import { describe, it, expect } from "vitest";
import { hedgeFromString } from "../src/hg/parse.js";
import { toStr } from "../src/hg/print.js";
import { typeOf, mtypeOf, argrolesOf, normalized } from "../src/hg/ops.js";

const parse = (s: string) => hedgeFromString(s)!;

describe("hg ops", () => {
  it("type/mtype basic", () => {
    const h = parse("(is/Pd.so graphbrain/Cp.s great/C)");
    expect(typeOf(h)).toBe("Rd");
    expect(mtypeOf(h)).toBe("R");
  });

  it("argroles detection", () => {
    const h = parse("(is/Pd.sc mary/C blue/C)");
    expect(argrolesOf(h)).toBe("sc");
  });

  it("normalized braces sort", () => {
    const h = parse("(plays/Pd.{os} mary/C chess/C)");
    const n = normalized(h);
    expect(toStr(n)).toContain("{os}");
  });
});
