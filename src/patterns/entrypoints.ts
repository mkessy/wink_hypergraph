import { Atom, Hedge } from "../hg/model.js";
import { match } from "./matcher.js";
import { emptyBindings, matchWithBindings } from "./variables.js";

export const edgeMatchesPattern = (edge: Hedge, pattern: Hedge): boolean =>
  match(edge, pattern);

export const edgeMatchWithBindings = (edge: Hedge, pattern: Hedge) =>
  matchWithBindings(edge, pattern, emptyBindings);
