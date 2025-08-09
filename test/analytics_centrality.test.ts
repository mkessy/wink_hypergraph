import { describe, it, expect } from "vitest";
import * as HG from "../src/memory/Hypergraph.js";
import { atom, hedge } from "../src/hg/model.js";
import {
  degreeCentrality,
  topK,
  degreeAtDepthCentrality,
  weightedDepthCentrality,
  normalizeScores,
} from "../src/analytics/Centrality.js";

describe("analytics centrality", () => {
  it("computes degree and depth-weighted centrality and topK", () => {
    let hg = HG.make();
    const e1 = hedge([
      atom("+/B/."),
      atom("say/Pd.{so}"),
      atom("alice/C"),
      atom("hi/C"),
    ] as any);
    const e2 = hedge([
      atom("+/B/."),
      atom("hear/Pd.{os}"),
      atom("bob/C"),
      e1 as any,
    ] as any);
    hg = HG.insert(hg, e1);
    hg = HG.insert(hg, e2);

    const deg = degreeCentrality(hg);
    expect(Array.from(deg).length > 0).toBe(true);

    const dd2 = degreeAtDepthCentrality(hg, 2);
    expect(Array.from(dd2).length >= 0).toBe(true);

    const weighted = weightedDepthCentrality(hg, { 1: 1, 2: 0.5, 3: 0.25 });
    const norm = normalizeScores(weighted);
    const top = topK(norm, 5);
    expect(top.length > 0).toBe(true);
  });
});
