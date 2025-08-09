import { describe, it, expect } from "vitest";
import * as HG from "../src/memory/Hypergraph.js";
import { atom, hedge } from "../src/hg/model.js";
import { Chunk } from "effect";

describe("hypergraph degree/star", () => {
  it("computes degree and star using root index", () => {
    let hg = HG.make();

    const e1 = hedge([
      atom("+/B/."),
      atom("see/Pd.{so}"),
      atom("alice/C"),
      atom("bob/C"),
    ] as any);
    const e2 = hedge([
      atom("+/B/."),
      atom("meet/Pd.{so}"),
      atom("alice/C"),
      atom("carol/C"),
    ] as any);
    const e3 = hedge([
      atom("+/B/."),
      atom("see/Pd.{so}"),
      atom("dave/C"),
      atom("bob/C"),
    ] as any);

    hg = HG.insert(hg, e1);
    hg = HG.insert(hg, e2);
    hg = HG.insert(hg, e3);

    // alice appears in two edges
    expect(HG.degree(hg, "alice")).toBe(2);
    const starAlice = HG.star(hg, "alice");
    expect(Chunk.size(starAlice)).toBe(2);

    // bob appears in two edges
    expect(HG.degree(hg, "bob")).toBe(2);
    const starBob = HG.star(hg, "bob");
    expect(Chunk.size(starBob)).toBe(2);

    // carol appears in one edge
    expect(HG.degree(hg, "carol")).toBe(1);
  });
});
