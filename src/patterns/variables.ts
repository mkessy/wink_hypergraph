import { HashMap, Option, Equal, HashSet } from "effect";
import { Atom, Hedge, isAtom, isHedge } from "../hg/model.js";
import { isVariableAtom, isWildcard } from "./properties.js";
import { matchAtom, normalizeUnorderedBracesText } from "./matcher.js";
import { argrolesOf } from "../hg/ops.js";

export type Bindings = HashMap.HashMap<string, Atom | Hedge>;

export const emptyBindings: Bindings = HashMap.empty();

const bind = (
  bindings: Bindings,
  name: string,
  value: Atom | Hedge
): Option.Option<Bindings> => {
  const existing = HashMap.get(bindings, name);
  if (existing._tag === "None")
    return Option.some(HashMap.set(bindings, name, value));
  // must be equal (structurally) to keep binding consistent
  const prev = existing.value;
  return Equal.equals(prev, value) ? Option.some(bindings) : Option.none();
};

export const matchWithBindings = (
  value: Atom | Hedge,
  pattern: Atom | Hedge,
  bindings: Bindings = emptyBindings
): Option.Option<Bindings> => {
  // Variable in pattern captures any value
  if (isAtom(pattern) && isVariableAtom(pattern)) {
    return bind(bindings, pattern.text, value);
  }
  // Wildcard in pattern matches any value
  if (isAtom(pattern) && isWildcard(pattern)) return Option.some(bindings);

  if (isAtom(value) && isAtom(pattern)) {
    return matchAtom(value, pattern) ? Option.some(bindings) : Option.none();
  }
  if (isHedge(value) && isHedge(pattern)) {
    if (value.items.length !== pattern.items.length) return Option.none();
    const unordered = (() => {
      const ar = argrolesOf(pattern);
      return ar && ar.startsWith("{") && ar.endsWith("}");
    })();

    // connector position must unify
    const head = matchWithBindings(
      value.items[0] as any,
      pattern.items[0] as any,
      bindings
    );
    if (head._tag === "None") return Option.none();
    let current = head.value;

    if (!unordered) {
      for (let i = 1; i < value.items.length; i++) {
        const next = matchWithBindings(
          value.items[i] as any,
          pattern.items[i] as any,
          current
        );
        if (next._tag === "None") return Option.none();
        current = next.value;
      }
      return Option.some(current);
    }

    // Unordered backtracking with bindings consistency
    const vArgs = value.items.slice(1) as ReadonlyArray<Atom | Hedge>;
    const pArgs = pattern.items.slice(1) as ReadonlyArray<Atom | Hedge>;
    const used = HashSet.empty<number>();

    const backtrack = (
      pi: number,
      usedIdx: typeof used,
      bnd: Bindings
    ): Option.Option<Bindings> => {
      if (pi === pArgs.length) return Option.some(bnd);
      const p = pArgs[pi]!;
      for (let vi = 0; vi < vArgs.length; vi++) {
        if (HashSet.has(usedIdx, vi)) continue;
        const next = matchWithBindings(vArgs[vi] as any, p as any, bnd);
        if (next._tag === "Some") {
          const nextUsed = HashSet.add(usedIdx, vi);
          const deeper = backtrack(pi + 1, nextUsed, next.value);
          if (deeper._tag === "Some") return deeper;
        }
      }
      return Option.none();
    };

    return backtrack(0, used, current);
  }
  return Option.none();
};
