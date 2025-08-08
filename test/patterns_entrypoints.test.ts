import { describe, it, expect } from "vitest";
import { atom, hedge } from "../src/hg/model.js";
import {
  edgeMatchesPattern,
  edgeMatchWithBindings,
} from "../src/patterns/entrypoints.js";
import { Option } from "effect";

describe("patterns entrypoints", () => {
  it("edgeMatchesPattern delegates to structural matcher", () => {
    const e = hedge([atom("+/B/."), atom("plays/Pd.{so}"), atom("mary/C")]);
    const p = hedge([atom("+/B/."), atom("*"), atom("mary/C")]);
    expect(edgeMatchesPattern(e as any, p as any)).toBe(true);
  });

  it("edgeMatchWithBindings returns Option of bindings", () => {
    const e = hedge([atom("+/B/."), atom("plays/Pd.{so}"), atom("mary/C")]);
    const p = hedge([atom("+/B/."), atom("?x"), atom("?x")]);
    const res = edgeMatchWithBindings(e as any, p as any);
    expect(Option.isNone(res)).toBe(true);
  });
});
