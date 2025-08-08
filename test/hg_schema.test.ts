import { describe, it, expect } from "vitest";
import { decodeEdgeString, encodeEdgeString } from "../src/hg/schema.js";

describe("hg schema", () => {
  it("edge string round trip", () => {
    const s = "(is graphbrain/1 great/1)";
    const h = decodeEdgeString(s);
    const out = encodeEdgeString(h);
    expect(out).toBe(s);
  });
});
