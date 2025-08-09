import { describe, it, expect } from "vitest";
import * as HG from "../src/memory/Hypergraph.js";
import { atom, hedge } from "../src/hg/model.js";
import { Chunk } from "effect";

describe("hypergraph sequences", () => {
  it("adds to sequence and retrieves in order", () => {
    let hg = HG.make();
    const e1 = hedge([
      atom("+/B/."),
      atom("say/Pd.{so}"),
      atom("alice/C"),
      atom("hi/C"),
    ] as any);
    const e2 = hedge([
      atom("+/B/."),
      atom("say/Pd.{so}"),
      atom("bob/C"),
      atom("hello/C"),
    ] as any);
    hg = HG.addToSequence(hg, "dialog", e1);
    hg = HG.addToSequence(hg, "dialog", e2);
    const seq = HG.sequence(hg, "dialog");
    expect(Chunk.size(seq)).toBe(2);
  });
});
