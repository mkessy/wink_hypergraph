import { describe, it, expect } from "vitest";
import * as HG from "../src/memory/Hypergraph.js";
import { atom, hedge } from "../src/hg/model.js";

describe("hypergraph attributes", () => {
  it("sets, gets, increments, decrements attributes", () => {
    let hg = HG.make();
    const e = hedge([atom("+/B/."), atom("ping/C"), atom("pong/C")] as any);
    hg = HG.insert(hg, e);

    hg = HG.setAttribute(hg, e, "count", "1");
    expect(HG.getStrAttribute(hg, e, "count")).toBe("1");

    hg = HG.incAttribute(hg, e, "count");
    expect(HG.getStrAttribute(hg, e, "count")).toBe("2");

    hg = HG.decAttribute(hg, e, "count");
    expect(HG.getStrAttribute(hg, e, "count")).toBe("1");
  });
});


