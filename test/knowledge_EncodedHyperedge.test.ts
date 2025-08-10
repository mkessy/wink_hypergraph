import { describe, it, expect } from "vitest";
import { Schema as S } from "effect";
import { EncodedHyperedge } from "../src/knowledge/Hyperedge.js";

describe("EncodedHyperedge", () => {
  it("encode → decode → encode stability", () => {
    const input = {
      id: "",
      type: "TraitEncoding",
      atoms: "(is/P john/C tall/C)",
      proof: {},
      deps: [],
      status: "partial" as const,
    };
    const decode = S.decodeUnknownSync(EncodedHyperedge as any);
    const encode = S.encodeSync(EncodedHyperedge as any);
    const decoded = decode(input);
    const re = encode(decoded);
    expect(re).toEqual({ ...input, metadata: undefined });
  });
});
