import { describe, it, expect } from "vitest";
import { str2atom, atom2str } from "../src/hg/encoding.js";
import { hedgeFromString, splitEdgeStr } from "../src/hg/parse.js";
import { toStr } from "../src/hg/print.js";

describe("hg core", () => {
  it("encodes/decodes atoms", () => {
    expect(str2atom("graph brain/(1).")).toBe("graph%20brain%2f%281%29%2e");
    expect(atom2str("graph%20brain%2f%281%29%2e")).toBe("graph brain/(1).");
  });

  it("splitEdgeStr works", () => {
    expect(splitEdgeStr("is graphbrain/1 great/1")).toEqual([
      "is",
      "graphbrain/1",
      "great/1",
    ]);
    expect(splitEdgeStr("src graphbrain/1 (is graphbrain/1 great/1)")).toEqual([
      "src",
      "graphbrain/1",
      "(is graphbrain/1 great/1)",
    ]);
  });

  it("hedgeFromString round trip", () => {
    const s = "(is graphbrain/1 great/1)";
    const h = hedgeFromString(s);
    expect(h).toBeDefined();
    expect(toStr(h!)).toBe(s);
  });
});
