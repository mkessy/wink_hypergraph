import { describe, it, expect } from "vitest";
import { atom, hedge } from "../src/hg/model.js";
import { matchWithBindings, emptyBindings } from "../src/patterns/variables.js";
import { Option, HashMap } from "effect";

describe("patterns variables", () => {
  it("binds variable atom to value", () => {
    const v = atom("john/C");
    const p = atom("?x");
    const res = matchWithBindings(v, p, emptyBindings);
    expect(Option.isSome(res)).toBe(true);
    const map = res as Option.Some<HashMap.HashMap<string, any>>;
    expect(HashMap.has(map.value, "?x")).toBe(true);
  });

  it("structural equality respected for separately constructed atoms", () => {
    const v1 = atom("john/C");
    const v2 = atom("john/C");
    const p = hedge([atom("+/B/."), atom("?x"), atom("?x")] as any);
    const res = matchWithBindings(
      hedge([atom("+/B/."), v1, v2]) as any,
      p,
      emptyBindings
    );
    // Should succeed because v1 and v2 are structurally equal
    expect(Option.isSome(res)).toBe(true);
  });

  it("consistent binding across hedge structure", () => {
    const v = hedge([atom("+/B/."), atom("plays/Pd.{so}"), atom("mary/C")]);
    const p = hedge([atom("+/B/."), atom("plays/Pd.{os}"), atom("?x")]);
    const res = matchWithBindings(v as any, p as any, emptyBindings);
    expect(Option.isSome(res)).toBe(true);
    const map = (res as any).value as HashMap.HashMap<string, any>;
    expect(HashMap.has(map, "?x")).toBe(true);
  });

  it("rejects conflicting bindings", () => {
    const v = hedge([atom("+/B/."), atom("plays/Pd.{so}"), atom("mary/C")]);
    const p = hedge([atom("+/B/."), atom("?x"), atom("?x")]);
    const res = matchWithBindings(v as any, p as any, emptyBindings);
    expect(Option.isNone(res)).toBe(true);
  });

  it("unordered binding succeeds regardless of order", () => {
    const v = hedge([atom("+/B/."), atom("mary/C"), atom("plays/Pd.{so}")]);
    const p = hedge([atom("+/B/."), atom("?x"), atom("plays/Pd.{os}")]);
    const res = matchWithBindings(v as any, p as any, emptyBindings);
    expect(Option.isSome(res)).toBe(true);
  });
});
