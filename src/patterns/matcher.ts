import { Atom, Hedge, isAtom, isHedge } from "../hg/model.js";
import { isWildcard, isUnorderedPattern } from "./properties.js";
import { Chunk, Option, HashSet, pipe } from "effect";
import { argrolesOf, connector } from "../hg/ops.js";

export const normalizeUnorderedBracesText = (text: string): string => {
  // Sort characters inside every {...} block for stable comparison
  let result = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "{") {
      const end = text.indexOf("}", i + 1);
      if (end === -1) return result + text.slice(i); // malformed, best-effort
      const inside = text.slice(i + 1, end);
      const sorted = inside.split("").sort().join("");
      result += `{${sorted}}`;
      i = end + 1;
    } else {
      result += ch;
      i++;
    }
  }
  return result;
};

export const matchAtom = (value: Atom, pattern: Atom): boolean => {
  if (isWildcard(pattern)) return true;
  return (
    normalizeUnorderedBracesText(value.text) ===
    normalizeUnorderedBracesText(pattern.text)
  );
};

export const match = (value: Atom | Hedge, pattern: Atom | Hedge): boolean => {
  // Atom wildcard matches anything (atom or hedge)
  if (isAtom(pattern) && isWildcard(pattern)) return true;
  if (isAtom(value) && isAtom(pattern)) return matchAtom(value, pattern);
  if (isHedge(value) && isHedge(pattern)) {
    if (value.items.length !== pattern.items.length) return false;
    // If unordered argroles, treat children after connector as permutation-insensitive
    const unordered = isUnorderedPattern(pattern);

    // Connector must match in any case in position 0
    if (!match(value.items[0] as any, pattern.items[0] as any)) return false;

    if (!unordered) {
      for (let i = 1; i < value.items.length; i++) {
        if (!match(value.items[i] as any, pattern.items[i] as any))
          return false;
      }
      return true;
    }

    // Unordered: backtracking assignment of pattern args to value args
    const vArgs = value.items.slice(1) as ReadonlyArray<Atom | Hedge>;
    const pArgs = pattern.items.slice(1) as ReadonlyArray<Atom | Hedge>;
    const used = HashSet.empty<number>();

    const backtrack = (pi: number, usedIdx: typeof used): boolean => {
      if (pi === pArgs.length) return true;
      const p = pArgs[pi]!;
      for (let vi = 0; vi < vArgs.length; vi++) {
        if (HashSet.has(usedIdx, vi)) continue;
        if (match(vArgs[vi] as any, p as any)) {
          const nextUsed = HashSet.add(usedIdx, vi);
          if (backtrack(pi + 1, nextUsed)) return true;
        }
      }
      return false;
    };
    return backtrack(0, used);
  }
  // Mismatched kinds (atom vs hedge): not supported in minimal matcher
  return false;
};

export const filterMatches = (
  edges: Iterable<Hedge>,
  pattern: Hedge
): Chunk.Chunk<Hedge> =>
  pipe(
    Chunk.fromIterable(edges),
    Chunk.filter((edge) => match(edge, pattern))
  );

export const findFirstMatch = (
  edges: Iterable<Hedge>,
  pattern: Hedge
): Option.Option<Hedge> => {
  return pipe(
    Chunk.fromIterable(edges),
    Chunk.findFirst((edge) => match(edge, pattern))
  );
};

export const matchAll = (
  values: Iterable<Atom | Hedge>,
  pattern: Atom | Hedge
): boolean => {
  return pipe(
    Chunk.fromIterable(values),
    Chunk.every((v) => match(v as any, pattern as any))
  );
};

export const matchAny = (
  values: Iterable<Atom | Hedge>,
  pattern: Atom | Hedge
): boolean => {
  return pipe(
    Chunk.fromIterable(values),
    Chunk.some((v) => match(v as any, pattern as any))
  );
};
