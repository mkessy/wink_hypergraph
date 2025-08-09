import { describe, it, expect } from "@effect/vitest";
import * as HG from "../src/memory/Hypergraph.js";
import { Effect } from "effect";
import * as Stream from "effect/Stream";
import { atom, hedge } from "../src/hg/model.js";

describe("hypergraph extra stream finders", () => {
  it("streams by argrole set and positional root", () =>
    Effect.gen(function* () {
      let hg = HG.make();
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
        atom("carol/C"),
      ] as any);
      hg = HG.insert(hg, e1);
      hg = HG.insert(hg, e2);

      const s1 = HG.streamByArgroleSet(hg, "os");
      const collected1 = yield* Stream.runCollect(s1);
      expect(collected1.length > 0).toBe(true);

      const s2 = HG.streamByArgRootN(hg, 2, "bob");
      const collected2 = yield* Stream.runCollect(s2);
      expect(collected2.length > 0).toBe(true);
    }));
});
