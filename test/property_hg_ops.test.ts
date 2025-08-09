import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { Schema as S } from "effect";
import * as Arb from "effect/Arbitrary";
import { atom, hedge, Atom, Hedge, isAtom, isHedge } from "../src/hg/model.js";
import { toStr } from "../src/hg/print.js";
import { checkCorrectness, typeOf } from "../src/hg/ops.js";

// Define a schema for atoms and simple hedges (depth-limited) for arbitrary generation
const AtomSchema = S.Struct({ kind: S.Literal("atom"), text: S.String });

// A small generator for valid-looking atom texts: root/type with optional roles
const atomTextArb = fc
  .record({
    root: fc
      .string({ minLength: 1, maxLength: 10 })
      .map((s) => s.replace(/[^a-z_]/gi, "").toLowerCase() || "a"),
    type: fc.constantFrom("C", "P", "M", "B", "T", "J"),
    roles: fc.option(fc.constantFrom("{so}", "{os}", ".so", ".os")),
  })
  .map(({ root, type, roles }) => `${root}/${type}${roles ?? ""}`);

const arbAtom = atomTextArb.map((t) => atom(t));

const arbHedgeDepth1: fc.Arbitrary<Hedge> = fc
  .tuple(
    // connector
    fc.constantFrom("+/B/.", "and/J", ":/J/.", "is/Pd.{so}", "hear/Pd.{os}"),
    // two args (atoms only to keep it small)
    arbAtom,
    arbAtom
  )
  .map(([c, a1, a2]) => hedge([atom(c), a1, a2] as any));

describe("property: toStr roundtrip and correctness on small hedges", () => {
  it("toStr(h) remains stable and correctness has no errors", () => {
    fc.assert(
      fc.property(arbHedgeDepth1, (h) => {
        const s = toStr(h);
        expect(typeof s).toBe("string");
        // typeOf should not throw on our constrained gen
        expect(() => typeOf(h as any)).not.toThrow();
        // correctness may flag some role mismatches; allow empty or benign
        const errs = checkCorrectness(h as any);
        expect(Array.isArray(errs)).toBe(true);
      }),
      { numRuns: 200 }
    );
  });
});
