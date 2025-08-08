import { describe, it, expect } from "vitest";
import { atom, hedge } from "../src/hg/model.js";
import { prettyPrint } from "../src/hg/pretty.js";

describe("hg pretty", () => {
  it("prints multi-line indented hyperedge", () => {
    const e = hedge([
      atom("+/B/."),
      hedge([atom("plays/Pd.{so}"), atom("mary/C")]) as any,
      atom("chess/C"),
    ] as any);
    const s = prettyPrint(e, { width: 20, indent: 2 });
    expect(typeof s).toBe("string");
    expect(s.includes("(+/B/."));
  });
});
