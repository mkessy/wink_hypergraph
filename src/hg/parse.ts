import { atom, hedge } from "./model.js";
import type { Atom, Hedge } from "./model.js";

const isDigit = (c: string) => c >= "0" && c <= "9";

const edgeStrHasOuterParens = (s: string): boolean =>
  s.length >= 2 && s[0] === "(" && s[s.length - 1] === ")";

export const splitEdgeStr = (edgeInner: string): ReadonlyArray<string> => {
  let start = 0;
  let depth = 0;
  let active = false;
  const tokens: string[] = [];
  for (let i = 0; i < edgeInner.length; i++) {
    const c = edgeInner[i];
    if (c === " ") {
      if (active && depth === 0) {
        tokens.push(edgeInner.slice(start, i));
        active = false;
      }
    } else if (c === "(") {
      if (depth === 0) {
        active = true;
        start = i;
      }
      depth += 1;
    } else if (c === ")") {
      depth -= 1;
      if (depth === 0) {
        tokens.push(edgeInner.slice(start, i + 1));
        active = false;
      } else if (depth < 0) {
        return [];
      }
    } else {
      if (!active) {
        active = true;
        start = i;
      }
    }
  }
  if (active) {
    if (depth > 0) return [];
    tokens.push(edgeInner.slice(start));
  }
  return tokens;
};

const _hedgeFromStringUnsafe = (source: string): Hedge | null => {
  const s = source.trim().replace(/\n/g, " ");
  let inner = s;
  const parens = edgeStrHasOuterParens(s);
  if (parens) inner = s.slice(1, -1);
  const tokens = splitEdgeStr(inner);
  if (!tokens || tokens.length === 0) return null;
  const edges = tokens.map((t) => parsedToken(t));
  if (
    edges.length > 1 ||
    (edges.length > 0 && (edges[0] as any).kind === "hedge")
  )
    return hedge(edges);
  if (edges.length > 0) return hedge([edges[0] as Atom]);
  return null;
};

const parsedToken = (token: string): Atom | Hedge => {
  if (edgeStrHasOuterParens(token)) return _hedgeFromStringUnsafe(token)!;
  return atom(token);
};

export const hedgeFromString = (source: string): Hedge | null =>
  _hedgeFromStringUnsafe(source) ?? hedge([atom(source)]);
