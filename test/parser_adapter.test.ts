import { describe, it, expect } from "vitest";
import { hedgeFromHypergraphString } from "../src/parser/adapter.js";
import { toStr } from "../src/hg/print.js";

describe("parser adapter", () => {
  it("converts hypergraph string to Hedge", () => {
    const s = "(+/B/. plays/Pd.{so} mary/C)";
    const h = hedgeFromHypergraphString(s)!;
    expect(h).toBeDefined();
    expect(toStr(h)).toBe(s);
  });
});
