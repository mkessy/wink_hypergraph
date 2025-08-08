import { Atom, Hedge, isAtom } from "./model.js";

export const toStr = (
  edge: Atom | Hedge,
  opts?: { rootsOnly?: boolean }
): string => {
  if (isAtom(edge)) {
    return edge.parens ? `(${edge.text})` : edge.text;
  }
  const s = edge.items.map((e) => toStr(e, opts)).join(" ");
  return `(${s})`;
};
