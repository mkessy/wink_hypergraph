import { HashMap, HashSet, Chunk, Option, pipe } from "effect";
import * as Stream from "effect/Stream";
import { Atom, Hedge, isAtom } from "../hg/model.js";
import { toStr } from "../hg/print.js";
import { connector, typeOf, argrolesOf, atoms } from "../hg/ops.js";
import { match as edgeMatches } from "../patterns/matcher.js";
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
  readonly byRoot: HashMap.HashMap<string, HashSet.HashSet<string>>;
  readonly byArgrole: HashMap.HashMap<string, HashSet.HashSet<string>>;
  readonly byHeadAtom: HashMap.HashMap<string, HashSet.HashSet<string>>;
}

export const make = (): Hypergraph => ({
  kv: KV.make(),
  byConnector: HashMap.empty(),
  byType: HashMap.empty(),
  byRoot: HashMap.empty(),
  byArgrole: HashMap.empty(),
  byHeadAtom: HashMap.empty(),
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
  // roots index
  let byRoot = hg.byRoot;
  for (const a of atoms(edge)) {
    byRoot = addToIndex(byRoot, (a as Atom).text.split("/")[0] ?? "", key);
  }
  // argroles index (each role letter)
  let byArgrole = hg.byArgrole;
  const rolesRaw = argrolesOf(edge);
  if (rolesRaw && rolesRaw.length > 0) {
    const roles = rolesRaw[0] === "{" ? rolesRaw.slice(1, -1) : rolesRaw;
    for (const r of roles.replace(/[,\s]/g, "")) {
      byArgrole = addToIndex(byArgrole, r, key);
    }
  }
  // head atom (first argument) when concrete atom (full text)
  let byHeadAtom = hg.byHeadAtom;
  if ((edge.items?.length ?? 0) > 1 && isAtom(edge.items[1] as any)) {
    const head = edge.items[1] as Atom;
    byHeadAtom = addToIndex(byHeadAtom, head.text, key);
  }
  return { kv, byConnector, byType, byRoot, byArgrole, byHeadAtom };
};

export const remove = (hg: Hypergraph, edge: Hedge): Hypergraph => {
  const key = toStr(edge);
  const conn = connector(edge);
  const typ = typeOf(edge);
  const kv = KV.remove(hg.kv, edge);
  const byConnector = removeFromIndex(hg.byConnector, toStr(conn), key);
  const byType = removeFromIndex(hg.byType, typ, key);
  let byRoot = hg.byRoot;
  for (const a of atoms(edge)) {
    byRoot = removeFromIndex(byRoot, (a as Atom).text.split("/")[0] ?? "", key);
  }
  let byArgrole = hg.byArgrole;
  const rolesRaw = argrolesOf(edge);
  if (rolesRaw && rolesRaw.length > 0) {
    const roles = rolesRaw[0] === "{" ? rolesRaw.slice(1, -1) : rolesRaw;
    for (const r of roles.replace(/[,\s]/g, "")) {
      byArgrole = removeFromIndex(byArgrole, r, key);
    }
  }
  let byHeadAtom = hg.byHeadAtom;
  if ((edge.items?.length ?? 0) > 1 && isAtom(edge.items[1] as any)) {
    const head = edge.items[1] as Atom;
    byHeadAtom = removeFromIndex(byHeadAtom, head.text, key);
  }
  return { kv, byConnector, byType, byRoot, byArgrole, byHeadAtom };
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
    candidateKeysForPattern(hg, pattern),
    (keys) => Chunk.fromIterable(HashSet.values(keys)),
    Chunk.flatMap((k) =>
      HashMap.get(hg.kv.map, k).pipe(
        Option.match({
          onNone: () => Chunk.empty<Hedge>(),
          onSome: (e) => Chunk.of(e),
        })
      )
    ),
    Chunk.filter((e) => KV.findByPattern(hg.kv, pattern).includes(e))
  );

// Iterate all edges as a Chunk (python hg.all equivalent)
export const all = (hg: Hypergraph): Chunk.Chunk<Hedge> =>
  Chunk.fromIterable(HashMap.values(hg.kv.map));

// ===== Stream APIs for large datasets =====

const keysToEdgeStream = (
  hg: Hypergraph,
  keys: HashSet.HashSet<string>
): Stream.Stream<Hedge> =>
  Stream.fromIterable(HashSet.values(keys)).pipe(
    Stream.map((k) => HashMap.get(hg.kv.map, k)),
    Stream.filter(Option.isSome),
    Stream.map((o) => (o as Option.Some<Hedge>).value)
  );

export const streamAll = (hg: Hypergraph): Stream.Stream<Hedge> =>
  Stream.fromIterable(HashMap.values(hg.kv.map));

export const streamByConnector = (
  hg: Hypergraph,
  connectorKey: string
): Stream.Stream<Hedge> =>
  keysToEdgeStream(hg, keysFromIndex(hg.byConnector, connectorKey));

export const streamByType = (
  hg: Hypergraph,
  typeKey: string
): Stream.Stream<Hedge> =>
  keysToEdgeStream(hg, keysFromIndex(hg.byType, typeKey));

export const streamByRoot = (
  hg: Hypergraph,
  root: string
): Stream.Stream<Hedge> => keysToEdgeStream(hg, keysFromIndex(hg.byRoot, root));

export const streamByHeadAtom = (
  hg: Hypergraph,
  headAtomText: string
): Stream.Stream<Hedge> =>
  keysToEdgeStream(hg, keysFromIndex(hg.byHeadAtom, headAtomText));

export const streamByPattern = (
  hg: Hypergraph,
  pattern: Hedge
): Stream.Stream<Hedge> =>
  keysToEdgeStream(hg, candidateKeysForPattern(hg, pattern)).pipe(
    Stream.filter((e) => edgeMatches(e, pattern))
  );

export const streamByPatternWithBindings = (
  hg: Hypergraph,
  pattern: Hedge
): Stream.Stream<EdgeWithBindings> =>
  keysToEdgeStream(hg, candidateKeysForPattern(hg, pattern)).pipe(
    Stream.map((e) => ({
      edge: e,
      res: matchWithBindings(e, pattern, emptyBindings),
    })),
    Stream.filter(({ res }) => res._tag === "Some"),
    Stream.map(({ edge, res }) => ({
      edge,
      bindings: (res as Option.Some<Bindings>).value,
    }))
  );

export interface EdgeWithBindings {
  readonly edge: Hedge;
  readonly bindings: Bindings;
}

export const findByPatternWithBindings = (
  hg: Hypergraph,
  pattern: Hedge
): Chunk.Chunk<EdgeWithBindings> => {
  const keys = candidateKeysForPattern(hg, pattern);
  let out = Chunk.empty<EdgeWithBindings>();
  for (const k of HashSet.values(keys)) {
    const opt = HashMap.get(hg.kv.map, k);
    if (opt._tag === "None") continue;
    const e = opt.value;
    const res = matchWithBindings(e, pattern, emptyBindings);
    if (res._tag === "Some") {
      out = Chunk.append(out, { edge: e, bindings: res.value });
    }
  }
  return out;
};

// ---------- Internal: candidate selection ----------

const isConcreteAtomText = (t: string): boolean =>
  t !== "*" && !t.startsWith("?") && t !== "(*)";

const intersect = (
  a: HashSet.HashSet<string>,
  b: HashSet.HashSet<string>
): HashSet.HashSet<string> => {
  // iterate smaller
  const [small, large] = HashSet.size(a) <= HashSet.size(b) ? [a, b] : [b, a];
  let out = HashSet.empty<string>();
  for (const k of HashSet.values(small))
    if (HashSet.has(large, k)) out = HashSet.add(out, k);
  return out;
};

const keysFromIndex = (
  index: HashMap.HashMap<string, HashSet.HashSet<string>>,
  key: string
): HashSet.HashSet<string> =>
  HashMap.get(index, key).pipe(
    Option.match({ onNone: () => HashSet.empty<string>(), onSome: (s) => s })
  );

const candidateKeysForPattern = (
  hg: Hypergraph,
  pattern: Hedge
): HashSet.HashSet<string> => {
  let candidates: HashSet.HashSet<string> | null = null;
  // connector
  const conn = pattern.items?.[0];
  if (conn && isAtom(conn as any)) {
    const text = (conn as Atom).text;
    if (isConcreteAtomText(text)) {
      const set = keysFromIndex(hg.byConnector, text);
      candidates = candidates ? intersect(candidates, set) : set;
    }
  }
  // first arg
  const arg1 = pattern.items?.[1];
  if (arg1 && isAtom(arg1 as any) && isConcreteAtomText((arg1 as Atom).text)) {
    const text = (arg1 as Atom).text;
    const root = text.split("/")[0] ?? "";
    // If head specifies roles or unordered braces, degrade to root index for broader candidate selection
    const useRoot = text.includes("{") || text.includes(".");
    const set = useRoot
      ? keysFromIndex(hg.byRoot, root)
      : keysFromIndex(hg.byHeadAtom, text);
    candidates = candidates ? intersect(candidates, set) : set;
  }
  // any concrete atoms by root
  const collectAtoms = (e: Atom | Hedge, acc: string[]) => {
    if (isAtom(e)) {
      const t = e.text;
      if (isConcreteAtomText(t)) acc.push(t.split("/")[0] ?? "");
      return;
    }
    for (const it of e.items as any) collectAtoms(it as any, acc);
  };
  const roots: string[] = [];
  collectAtoms(pattern as any, roots);
  for (const r of roots) {
    if (!r) continue;
    const set = keysFromIndex(hg.byRoot, r);
    candidates = candidates ? intersect(candidates, set) : set;
  }
  // argroles on connector (letters)
  if (conn && isAtom(conn as any)) {
    const parts = (conn as Atom).text.split("/");
    if (parts.length > 1) {
      const typeParts = parts[1].split(".");
      if (typeParts.length > 1) {
        const roles = typeParts[1];
        const letters = roles[0] === "{" ? roles.slice(1, -1) : roles;
        for (const r of letters.replace(/[,\s]/g, "")) {
          const set = keysFromIndex(hg.byArgrole, r);
          candidates = candidates ? intersect(candidates, set) : set;
        }
      }
    }
  }
  return candidates ?? HashSet.empty<string>();
};
