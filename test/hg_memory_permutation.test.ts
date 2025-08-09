import { describe, it, expect } from "vitest";
import * as HG from "../src/memory/Hypergraph.js";
import { atom, hedge } from "../src/hg/model.js";

describe("hypergraph permutation-friendly indexes", () => {
  it("finds matches independent of arg order for unordered roles", () => {
    let hg = HG.make();

    // Build two edges with swapped arg order for unordered roles {os}
    const e1 = hedge([
      atom("+/B/."),
      atom("hear/Pd.{os}"),
      atom("alice/C"),
      atom("bob/C"),
    ] as any);
    const e2 = hedge([
      atom("+/B/."),
      atom("hear/Pd.{os}"),
      atom("bob/C"),
      atom("alice/C"),
    ] as any);

    hg = HG.insert(hg, e1);
    hg = HG.insert(hg, e2);

    // Pattern should match both edges regardless of order
    const pat = hedge([
      atom("+/B/."),
      atom("hear/Pd.{os}"),
      atom("alice/C"),
      atom("bob/C"),
    ] as any);

    const res = HG.findByPattern(hg, pat);
    expect(res.length).toBe(2);
  });
});


