import { describe, it, expect } from "vitest";
import { hedgeFromString } from "../src/hg/parse.js";
import { atoms, allAtoms, sizeOf, depthOf, rootsOf } from "../src/hg/ops.js";
import { toStr } from "../src/hg/print.js";

const parse = (s: string) => hedgeFromString(s)!;

describe("hg ops more", () => {
  it("atoms and allAtoms", () => {
    const h = parse("(src graphbrain/2 (is graphbrain/1 great/1))");
    const atomTexts = atoms(h)
      .map((a: any) => a.text)
      .sort();
    // includes connector and concept atoms
    expect(atomTexts).toContain("is");
    expect(atomTexts).toContain("graphbrain/1");
    expect(atomTexts).toContain("graphbrain/2");
    expect(atomTexts).toContain("great/1");
    expect(allAtoms(h).map((a: any) => a.text)).toEqual([
      "src",
      "graphbrain/2",
      "is",
      "graphbrain/1",
      "great/1",
    ]);
  });

  it("size and depth", () => {
    const h1 = parse("graphbrain/1");
    expect(sizeOf(h1)).toBe(1);
    expect(depthOf(h1)).toBe(0);
    const h2 = parse("(is graphbrain/1 (super great/1))");
    expect(sizeOf(h2)).toBe(4);
    expect(depthOf(h2)).toBe(2);
  });

  it("roots", () => {
    const h = parse("(is graphbrain/1 great/1)");
    expect(toStr(rootsOf(h))).toBe("(is graphbrain great)");
  });
});
