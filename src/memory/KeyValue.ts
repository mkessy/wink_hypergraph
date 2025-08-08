import { Hedge } from "../hg/model.js";
import { toStr } from "../hg/print.js";
import { match } from "../patterns/matcher.js";
import { HashMap, Option, String, pipe } from "effect";

export interface KeyValueStore {
  readonly map: HashMap.HashMap<string, Hedge>;
}

export const make = (): KeyValueStore => ({ map: HashMap.empty() });

export const keyOf = (edge: Hedge): string => toStr(edge);

export const insert = (store: KeyValueStore, edge: Hedge): KeyValueStore => {
  const key = keyOf(edge);
  const next = HashMap.set(store.map, key, edge);
  return { map: next };
};

export const remove = (store: KeyValueStore, edge: Hedge): KeyValueStore => {
  const key = keyOf(edge);
  if (!HashMap.has(store.map, key)) return store;
  const next = HashMap.remove(store.map, key);
  return { map: next };
};

export const has = (store: KeyValueStore, edge: Hedge): boolean =>
  HashMap.has(store.map, keyOf(edge));

export const size = (store: KeyValueStore): number => HashMap.size(store.map);

export const values = (store: KeyValueStore): ReadonlyArray<Hedge> =>
  Array.from(HashMap.values(store.map));

export const getByKey = (
  store: KeyValueStore,
  key: string
): Option.Option<Hedge> => HashMap.get(store.map, key);

export const get = (store: KeyValueStore, edge: Hedge): Option.Option<Hedge> =>
  getByKey(store, keyOf(edge));

export const findByPrefix = (
  store: KeyValueStore,
  prefix: string
): ReadonlyArray<Hedge> => {
  const results: Hedge[] = [];
  for (const [k, v] of HashMap.entries(store.map)) {
    const starts =
      pipe(k, String.startsWith(prefix)) ||
      pipe(k, String.startsWith("(" + prefix));
    if (starts) results.push(v);
  }
  return results;
};

export const findByPattern = (
  store: KeyValueStore,
  pattern: Hedge
): ReadonlyArray<Hedge> => {
  const results: Hedge[] = [];
  for (const v of HashMap.values(store.map))
    if (match(v, pattern)) results.push(v);
  return results;
};
