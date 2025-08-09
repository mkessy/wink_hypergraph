import { describe, it, expect } from "vitest";
import { atom, hedge } from "../src/hg/model.js";
import * as HG from "../src/memory/Hypergraph.js";
import * as Stream from "effect/Stream";
import { Effect, Chunk } from "effect";

describe("hg stream apis", () => {
  it("streams by connector/type/root/head and pattern", async () => {
    let hg = HG.make();
    const e1 = hedge([
      atom("+/B/."),
      atom("plays/Pd.{so}"),
      atom("mary/C"),
    ] as any);
    const e2 = hedge([
      atom("+/B/."),
      atom("eats/Pd.{so}"),
      atom("john/C"),
    ] as any);
    const e3 = hedge([
      atom("+/B/."),
      atom("plays/Pd.{so}"),
      atom("john/C"),
    ] as any);
    hg = HG.insert(hg, e1);
    hg = HG.insert(hg, e2);
    hg = HG.insert(hg, e3);

    const sConn = HG.streamByConnector(hg, "+/B/.");
    const sType = HG.streamByType(hg, "C");
    const sRoot = HG.streamByRoot(hg, "john");
    const sHead = HG.streamByHeadAtom(hg, "plays/Pd.{so}");
    const sPat = HG.streamByPattern(
      hg,
      hedge([atom("+/B/."), atom("plays/Pd.{os}"), atom("*")] as any)
    );

    const [c1, c2, c3, c4, c5] = await Promise.all([
      Effect.runPromise(Stream.runCollect(sConn)),
      Effect.runPromise(Stream.runCollect(sType)),
      Effect.runPromise(Stream.runCollect(sRoot)),
      Effect.runPromise(Stream.runCollect(sHead)),
      Effect.runPromise(Stream.runCollect(sPat)),
    ]);

    expect(Chunk.size(c1)).toBe(3);
    expect(Chunk.size(c2)).toBe(3);
    expect(Chunk.size(c3)).toBe(2);
    expect(Chunk.size(c4)).toBe(2);
    expect(Chunk.size(c5)).toBe(2);
  });
});
