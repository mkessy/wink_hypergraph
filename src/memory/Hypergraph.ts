import { HashMap, HashSet, Chunk, Option, pipe } from "effect";
import { Hedge } from "../hg/model.js";
import { toStr } from "../hg/print.js";
import { connector, typeOf } from "../hg/ops.js";
import * as KV from "./KeyValue.js";
import {
  matchWithBindings,
  emptyBindings,
  Bindings,
} from "../patterns/variables.js";

export interface Hypergraph {
  readonly kv: KV.KeyValueStore;
  readonly byConnector: HashMap.HashMap<string, HashSet.HashSet<string>>;
  readonly byType: HashMap.HashMap<string, HashSet.HashSet<string>>;
}

export const make = (): Hypergraph => ({
  kv: KV.make(),
  byConnector: HashMap.empty(),
  byType: HashMap.empty(),
});

const addToIndex = (
  index: HashMap.HashMap<string, HashSet.HashSet<string>>,
  key: string,
  edgeKey: string
): HashMap.HashMap<string, HashSet.HashSet<string>> =>
  HashMap.get(index, key)
    .pipe(Option.getOrElse(() => HashSet.empty<string>()))
    .pipe((set) => HashSet.add(set, edgeKey))
    .pipe((set) => HashMap.set(index, key, set));

const removeFromIndex = (
  index: HashMap.HashMap<string, HashSet.HashSet<string>>,
  key: string,
  edgeKey: string
): HashMap.HashMap<string, HashSet.HashSet<string>> =>
  HashMap.get(index, key).pipe(
    Option.match({
      onNone: () => index,
      onSome: (set) => {
        const nextSet = HashSet.remove(set, edgeKey);
        return HashSet.size(nextSet) === 0
          ? HashMap.remove(index, key)
          : HashMap.set(index, key, nextSet);
      },
    })
  );

export const insert = (hg: Hypergraph, edge: Hedge): Hypergraph => {
  const key = toStr(edge);
  const conn = connector(edge);
  const typ = typeOf(edge);
  const kv = KV.insert(hg.kv, edge);
  const byConnector = addToIndex(hg.byConnector, toStr(conn), key);
  const byType = addToIndex(hg.byType, typ, key);
  return { kv, byConnector, byType };
};

export const remove = (hg: Hypergraph, edge: Hedge): Hypergraph => {
  const key = toStr(edge);
  const conn = connector(edge);
  const typ = typeOf(edge);
  const kv = KV.remove(hg.kv, edge);
  const byConnector = removeFromIndex(hg.byConnector, toStr(conn), key);
  const byType = removeFromIndex(hg.byType, typ, key);
  return { kv, byConnector, byType };
};

export const size = (hg: Hypergraph): number => KV.size(hg.kv);

export const values = (hg: Hypergraph): ReadonlyArray<Hedge> =>
  KV.values(hg.kv);

export const get = (hg: Hypergraph, edge: Hedge) => KV.get(hg.kv, edge);

export const getByKey = (hg: Hypergraph, key: string) =>
  KV.getByKey(hg.kv, key);

export const findByConnector = (
  hg: Hypergraph,
  connKey: string
): Chunk.Chunk<Hedge> =>
  HashMap.get(hg.byConnector, connKey).pipe(
    Option.match({
      onNone: () => Chunk.empty<Hedge>(),
      onSome: (set) =>
        Chunk.fromIterable(HashSet.values(set)).pipe(
          Chunk.flatMap((k) =>
            HashMap.get(hg.kv.map, k).pipe(
              Option.match({
                onNone: () => Chunk.empty<Hedge>(),
                onSome: (edge) => Chunk.of(edge),
              })
            )
          )
        ),
    })
  );

export const findByType = (
  hg: Hypergraph,
  typeKey: string
): Chunk.Chunk<Hedge> =>
  HashMap.get(hg.byType, typeKey).pipe(
    Option.match({
      onNone: () => Chunk.empty<Hedge>(),
      onSome: (set) =>
        Chunk.fromIterable(HashSet.values(set)).pipe(
          Chunk.flatMap((k) =>
            HashMap.get(hg.kv.map, k).pipe(
              Option.match({
                onNone: () => Chunk.empty<Hedge>(),
                onSome: (edge) => Chunk.of(edge),
              })
            )
          )
        ),
    })
  );

export const findByPattern = (
  hg: Hypergraph,
  pattern: Hedge
): Chunk.Chunk<Hedge> =>
  pipe(
    Chunk.fromIterable(HashMap.values(hg.kv.map)),
    Chunk.filter((e) => KV.findByPattern(hg.kv, pattern).includes(e))
  );

export interface EdgeWithBindings {
  readonly edge: Hedge;
  readonly bindings: Bindings;
}

export const findByPatternWithBindings = (
  hg: Hypergraph,
  pattern: Hedge
): Chunk.Chunk<EdgeWithBindings> => {
  let out = Chunk.empty<EdgeWithBindings>();
  for (const e of HashMap.values(hg.kv.map)) {
    const res = matchWithBindings(e, pattern, emptyBindings);
    if (res._tag === "Some") {
      out = Chunk.append(out, { edge: e, bindings: res.value });
    }
  }
  return out;
};
