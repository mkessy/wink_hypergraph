import { describe, it, expect } from "@effect/vitest";
import * as HG from "../src/memory/Hypergraph.js";
import { atom, hedge } from "../src/hg/model.js";
import * as Stream from "effect/Stream";
import { Effect } from "effect";

describe("hypergraph depth-aware indexing", () => {
  it("indexes roots by depth and queries by depth", () =>
    Effect.gen(function* () {
      let hg = HG.make();
      // ( + (hear ...) ( (say ...) (alice) ) ) → alice at depth >= 2
      const inner = hedge([
        atom("+/B/."),
        atom("say/Pd.{so}"),
        atom("alice/C"),
        atom("hi/C"),
      ] as any);
      const outer = hedge([
        atom("+/B/."),
        atom("hear/Pd.{os}"),
        inner as any,
        atom("bob/C"),
      ] as any);
      hg = HG.insert(hg, outer);

      expect(HG.degree(hg, "alice")).toBe(1);
      expect(HG.deepDegree(hg, "alice")).toBe(1);
      expect(
        HG.degreeAtDepth(hg, "alice", 2) + HG.degreeAtDepth(hg, "alice", 3)
      ).toBeGreaterThan(0);

      const s = HG.streamByRootAtDepth(hg, "alice", 3);
      const collected = yield* Stream.runCollect(s);
      expect(collected.length > 0).toBe(true);
    }));
});
