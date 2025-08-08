import { describe, it, expect } from "vitest";
import { atom, hedge } from "../src/hg/model.js";
import {
  isWildcard,
  isPattern,
  isUnorderedPattern,
  isFullPattern,
  isVariableAtom,
} from "../src/patterns/properties.js";

describe("patterns properties", () => {
  it("detects wildcard atoms", () => {
    expect(isWildcard(atom("*"))).toBe(true);
    expect(isWildcard(atom("."))).toBe(true);
    expect(isWildcard(atom("(*)"))).toBe(true);
    expect(isWildcard(atom("a"))).toBe(false);
  });

  it("detects variable atoms", () => {
    expect(isVariableAtom(atom("?x"))).toBe(true);
    expect(isVariableAtom(atom("x?"))).toBe(false);
  });

  it("detects pattern atoms and hedges", () => {
    expect(isPattern(atom("Pd.{so}"))).toBe(true);
    expect(isPattern(atom("plays/Pd.{so}"))).toBe(true);
    expect(isPattern(atom("plays/Pd.so"))).toBe(false);
    expect(isPattern(hedge([atom("+/B/."), atom("*"), atom("mary/C")]))).toBe(
      true
    );
  });

  it("detects unordered pattern presence", () => {
    expect(isUnorderedPattern(atom("Pd.{so}"))).toBe(true);
    expect(isUnorderedPattern(atom("plays/Pd.{so}"))).toBe(true);
    expect(isUnorderedPattern(atom("plays/Pd.so"))).toBe(false);
  });

  it("isFullPattern only when all children are patterns", () => {
    const p1 = hedge([atom("+/B/."), atom("*"), atom("mary/C")]);
    const p2 = hedge([atom("+/B/."), atom("plays/Pd.{so}"), atom("mary/C")]);
    expect(isFullPattern(p1)).toBe(false);
    expect(isFullPattern(p2)).toBe(false);
    expect(isFullPattern(atom("*"))).toBe(true);
  });
});
