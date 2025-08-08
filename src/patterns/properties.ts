import { Atom, Hedge, isAtom } from "../hg/model.js";
import { isPatternText, isWildcardText } from "./schema.js";

export const isWildcard = (a: Atom): boolean => isWildcardText(a.text);

export const isFunPattern = (_e: Atom | Hedge): boolean => false;

export const isPattern = (e: Atom | Hedge): boolean => {
  if (isAtom(e)) return isPatternText(e.text);
  return e.items.some((it) => isPattern(it as any));
};

export const isUnorderedPattern = (e: Atom | Hedge): boolean => {
  if (isAtom(e)) return e.text.includes("{");
  return e.items.some((it) => isUnorderedPattern(it as any));
};

export const isFullPattern = (e: Atom | Hedge): boolean => {
  if (isAtom(e)) return isPattern(e);
  return e.items.every((it) => isPattern(it as any));
};

export const isVariableAtom = (a: Atom): boolean => a.text.startsWith("?");
