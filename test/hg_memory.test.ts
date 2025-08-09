import { describe, it, expect } from "vitest";
import { atom, hedge } from "../src/hg/model.js";
import * as HG from "../src/memory/Hypergraph.js";
import { toStr } from "../src/hg/print.js";
import { Chunk } from "effect";
import {
  findByPattern,
  findByPatternWithBindings,
} from "../src/memory/Hypergraph.js";

describe("memory Hypergraph indices", () => {
  it("insert, size, values, findByConnector and findByType", () => {
    let hg = HG.make();
    const e1 = hedge([atom("+/B/."), atom("plays/Pd.{so}"), atom("mary/C")]);
    const e2 = hedge([atom("+/B/."), atom("eats/Pd.{so}"), atom("john/C")]);
    const e3 = hedge([atom("+/B/."), atom("plays/Pd.{so}"), atom("john/C")]);

    hg = HG.insert(hg, e1);
    hg = HG.insert(hg, e2);
    hg = HG.insert(hg, e3);

    expect(HG.size(hg)).toBe(3);
    expect(HG.values(hg).map(toStr).sort()).toEqual(
      [e1, e2, e3].map(toStr).sort()
    );

    const byConn = HG.findByConnector(hg, toStr(atom("+/B/.")));
    expect(Chunk.size(byConn)).toBe(3);

    // Edge type is derived from connector type; B-builders produce C-edges
    const byType = HG.findByType(hg, "C");
    expect(Chunk.size(byType)).toBe(3);

    hg = HG.remove(hg, e2);
    expect(HG.size(hg)).toBe(2);
    const byConn2 = HG.findByConnector(hg, toStr(atom("+/B/.")));
    expect(Chunk.size(byConn2)).toBe(2);
  });

  it("pattern search and bindings", () => {
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
    hg = HG.insert(hg, e1);
    hg = HG.insert(hg, e2);

    const p = hedge([atom("+/B/."), atom("*"), atom("mary/C")] as any);
    const found = findByPattern(hg, p);
    expect(Chunk.size(found)).toBe(1);

    const p2 = hedge([atom("+/B/."), atom("?x"), atom("mary/C")] as any);
    const found2 = findByPatternWithBindings(hg, p2);
    expect(Chunk.size(found2)).toBe(1);
  });
});
