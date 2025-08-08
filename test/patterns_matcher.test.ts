import { describe, it, expect } from "vitest";
import { atom, hedge } from "../src/hg/model.js";
import {
  match,
  filterMatches,
  findFirstMatch,
  matchAll,
  matchAny,
} from "../src/patterns/matcher.js";
import { Chunk, Option } from "effect";
import { edgeMatchesPattern } from "../src/patterns/entrypoints.js";

describe("patterns matcher", () => {
  it("matches wildcard atoms", () => {
    const a = atom("hello/C");
    expect(match(a, atom("*"))).toBe(true);
    expect(match(a, atom("."))).toBe(true);
    expect(match(a, atom("(*)"))).toBe(true);
  });

  it("normalizes unordered braces in atom text", () => {
    expect(match(atom("Pd.{so}"), atom("Pd.{os}"))).toBe(true);
    expect(match(atom("{so}"), atom("{os}"))).toBe(true);
    expect(match(atom("{sso}"), atom("{oss}"))).toBe(true);
  });

  it("matches hedges with equal structure", () => {
    const e1 = hedge([atom("+/B/."), atom("plays/Pd.{so}"), atom("mary/C")]);
    const p1 = hedge([atom("+/B/."), atom("plays/Pd.{os}"), atom("mary/C")]);
    expect(match(e1 as any, p1 as any)).toBe(true);
  });

  it("supports wildcard inside hedges", () => {
    const e = hedge([atom("+/B/."), atom("plays/Pd.{so}"), atom("mary/C")]);
    const p = hedge([atom("+/B/."), atom("*"), atom("mary/C")]);
    expect(match(e as any, p as any)).toBe(true);
  });

  it("unordered args: allows reversed assignment", () => {
    const e = hedge([atom("+/B/."), atom("mary/C"), atom("plays/Pd.{so}")]);
    const p = hedge([atom("+/B/."), atom("plays/Pd.{os}"), atom("mary/C")]);
    expect(match(e as any, p as any)).toBe(true);
  });

  it("rejects mismatched kinds and sizes", () => {
    expect(match(atom("x"), hedge([atom("x")]) as any)).toBe(false);
    const e = hedge([atom("a"), atom("b")]);
    const p = hedge([atom("a")]);
    expect(match(e as any, p as any)).toBe(false);
  });

  it("entrypoint edgeMatchesPattern delegates to matcher", () => {
    const e = hedge([atom("+/B/."), atom("plays/Pd.{so}"), atom("mary/C")]);
    const p = hedge([atom("+/B/."), atom("plays/Pd.{os}"), atom("mary/C")]);
    expect(edgeMatchesPattern(e as any, p as any)).toBe(true);
  });

  it("filterMatches returns Chunk of matches (data-first)", () => {
    const e1 = hedge([atom("+/B/."), atom("plays/Pd.{so}"), atom("mary/C")]);
    const e2 = hedge([atom("+/B/."), atom("eats/Pd.{so}"), atom("john/C")]);
    const p = hedge([atom("+/B/."), atom("*"), atom("mary/C")]);
    const out = filterMatches([e1, e2], p);
    expect(Chunk.size(out)).toBe(1);
  });

  it("findFirstMatch returns Option", () => {
    const e1 = hedge([atom("+/B/."), atom("plays/Pd.{so}"), atom("mary/C")]);
    const e2 = hedge([atom("+/B/."), atom("eats/Pd.{so}"), atom("john/C")]);
    const p = hedge([atom("+/B/."), atom("*"), atom("mary/C")]);
    const some = findFirstMatch([e1, e2], p);
    expect(Option.isSome(some)).toBe(true);
    const none = findFirstMatch([e2], p);
    expect(Option.isNone(none)).toBe(true);
  });

  it("atom wildcard pattern matches any value kind", () => {
    expect(match(hedge([atom("a")]), atom("*") as any)).toBe(true);
  });

  it("matchAll and matchAny work for data-first multi-value checks", () => {
    const e1 = hedge([atom("+/B/."), atom("plays/Pd.{so}"), atom("mary/C")]);
    const e2 = hedge([atom("+/B/."), atom("eats/Pd.{so}"), atom("john/C")]);
    const p1 = hedge([atom("+/B/."), atom("*"), atom("mary/C")]);
    expect(matchAll([e1], p1 as any)).toBe(true);
    expect(matchAny([e1, e2], p1 as any)).toBe(true);
    expect(matchAll([e1, e2], p1 as any)).toBe(false);
  });
});
