import { describe, it, expect } from "vitest";
import { atom, hedge } from "../src/hg/model.js";
import { match } from "../src/patterns/matcher.js";
import { matchWithBindings, emptyBindings } from "../src/patterns/variables.js";
import { Option } from "effect";

describe("patterns examples from verify output", () => {
  it("matches builder with hear/Pd.{so} and args (unordered)", () => {
    const e = hedge([
      atom("+/B/."),
      atom("hear/Pd.{so}"),
      atom("me/Cc"),
      hedge([atom("the/Md"), atom("name/Cc")]) as any,
    ] as any);
    const p = hedge([
      atom("+/B/."),
      atom("hear/Pd.{os}"),
      atom("*"),
      atom("*"),
    ] as any);
    expect(match(e as any, p as any)).toBe(true);

    // Reversed args should still match due to unordered roles
    const eRev = hedge([
      atom("+/B/."),
      atom("hear/Pd.{so}"),
      hedge([atom("the/Md"), atom("name/Cc")]) as any,
      atom("me/Cc"),
    ] as any);
    expect(match(eRev as any, p as any)).toBe(true);
  });

  it("matches top-level and/J with two arguments", () => {
    const e = hedge([
      atom("and/J"),
      hedge([atom("+/B/."), atom("pale/Ma"), atom("face/Cc")]) as any,
      hedge([atom("+/B/."), atom("with/Cc"), atom("thought/Cc")]) as any,
    ] as any);
    const p = hedge([atom("and/J"), atom("*"), atom("*")] as any);
    expect(match(e as any, p as any)).toBe(true);
  });

  it("matches :/J/. with nested so/J and punctuation tail", () => {
    const e = hedge([
      atom(":/J/."),
      hedge([
        atom("so/J"),
        hedge([atom("+/B/."), atom("after/T"), atom("softly/Ma")]) as any,
      ]) as any,
      atom("!"),
    ] as any);
    const p = hedge([
      atom(":/J/."),
      hedge([atom("so/J"), atom("*")] as any) as any,
      atom("*"),
    ] as any);
    expect(match(e as any, p as any)).toBe(true);
  });

  it("bindings: capture the predicate under and/J", () => {
    const e = hedge([
      atom("and/J"),
      hedge([atom("+/B/."), atom("pale/Ma"), atom("face/Cc")]) as any,
      hedge([atom("+/B/."), atom("with/Cc"), atom("thought/Cc")]) as any,
    ] as any);
    const p = hedge([atom("and/J"), atom("?x"), atom("*")] as any);
    const res = matchWithBindings(e as any, p as any, emptyBindings);
    expect(Option.isSome(res)).toBe(true);
  });
});
