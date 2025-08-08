import { describe, it, expect } from "vitest";
import { hedgeFromString } from "../src/hg/parse.js";
import { toStr } from "../src/hg/print.js";
import {
  insertFirstArgument,
  connect,
  contains,
  subedges,
  edgesWithArgrole,
} from "../src/hg/ops.js";

const parse = (s: string) => hedgeFromString(s)!;

describe("hg struct ops", () => {
  it("insertFirstArgument", () => {
    const e = parse("(a b)");
    const res = insertFirstArgument(e, parse("(c d)"));
    expect(toStr(res)).toBe("(a (c d) b)");
  });

  it("connect", () => {
    const e = parse("(a b)");
    const res = connect(e, [parse("(c d)")]);
    expect(toStr(res)).toBe("(a b (c d))");
  });

  it("contains and subedges", () => {
    const e = parse("(is graphbrain/1 (super great/1))");
    expect(contains(e, parse("is"))).toBe(true);
    expect(contains(e, parse("(super great/1)"))).toBe(true);
    expect(subedges(e).length).toBeGreaterThan(1);
  });

  it("edgesWithArgrole", () => {
    const e = parse("(is/Pd.sc mary/C blue/C)");
    const s = edgesWithArgrole(e, "s");
    const c = edgesWithArgrole(e, "c");
    expect(toStr(s[0] as any)).toBe("mary/C");
    expect(toStr(c[0] as any)).toBe("blue/C");
  });
});
