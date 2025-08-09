import { HashMap, HashSet, Chunk, Option, pipe, Effect } from "effect";
import * as Stream from "effect/Stream";
import { atom, Atom, hedge, Hedge, isAtom } from "../hg/model.js";
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
  readonly attrs: HashMap.HashMap<string, HashMap.HashMap<string, string>>;
  readonly byArity: HashMap.HashMap<string, HashSet.HashSet<string>>;
  readonly byArgroleSet: HashMap.HashMap<string, HashSet.HashSet<string>>;
  readonly byArgRootN: HashMap.HashMap<
    number,
    HashMap.HashMap<string, HashSet.HashSet<string>>
  >;
  readonly byArgsMultiset: HashMap.HashMap<string, HashSet.HashSet<string>>;
  readonly byRootDepth: HashMap.HashMap<
    number,
    HashMap.HashMap<string, HashSet.HashSet<string>>
  >;
}

export const make = (): Hypergraph => ({
  kv: KV.make(),
  byConnector: HashMap.empty(),
  byType: HashMap.empty(),
  byRoot: HashMap.empty(),
  byArgrole: HashMap.empty(),
  byHeadAtom: HashMap.empty(),
  attrs: HashMap.empty(),
  byArity: HashMap.empty(),
  byArgroleSet: HashMap.empty(),
  byArgRootN: HashMap.empty(),
  byArgsMultiset: HashMap.empty(),
  byRootDepth: HashMap.empty(),
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

const addToNestedIndex = (
  nested: HashMap.HashMap<
    number,
    HashMap.HashMap<string, HashSet.HashSet<string>>
  >,
  position: number,
  key: string,
  edgeKey: string
): HashMap.HashMap<
  number,
  HashMap.HashMap<string, HashSet.HashSet<string>>
> => {
  const innerOpt = HashMap.get(nested, position);
  const inner =
    innerOpt._tag === "Some"
      ? innerOpt.value
      : HashMap.empty<string, HashSet.HashSet<string>>();
  const updatedInner = addToIndex(inner, key, edgeKey);
  return HashMap.set(nested, position, updatedInner);
};

const removeFromNestedIndex = (
  nested: HashMap.HashMap<
    number,
    HashMap.HashMap<string, HashSet.HashSet<string>>
  >,
  position: number,
  key: string,
  edgeKey: string
): HashMap.HashMap<
  number,
  HashMap.HashMap<string, HashSet.HashSet<string>>
> => {
  const innerOpt = HashMap.get(nested, position);
  if (innerOpt._tag === "None") return nested;
  const updatedInner = removeFromIndex(innerOpt.value, key, edgeKey);
  return HashMap.set(nested, position, updatedInner);
};

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
  // byArity
  const arity = Math.max(0, (edge.items?.length ?? 1) - 1);
  const byArity = addToIndex(hg.byArity, String(arity), key);
  // byArgroleSet (normalized, sorted letters)
  let byArgroleSet = hg.byArgroleSet;
  const rolesForSet = argrolesOf(edge);
  if (rolesForSet && rolesForSet.length > 0) {
    const letters =
      rolesForSet[0] === "{" ? rolesForSet.slice(1, -1) : rolesForSet;
    const norm = letters.replace(/[\s,]/g, "").split("").sort().join("");
    if (norm.length > 0) byArgroleSet = addToIndex(byArgroleSet, norm, key);
  }
  // byArgRootN (positional roots for atom arguments)
  let byArgRootN = hg.byArgRootN;
  const argCount = Math.max(0, (edge.items?.length ?? 1) - 1);
  for (let i = 1; i <= argCount; i++) {
    const arg = edge.items[i] as any;
    if (isAtom(arg)) {
      const root = (arg as Atom).text.split("/")[0] ?? "";
      if (root) byArgRootN = addToNestedIndex(byArgRootN, i, root, key);
    }
  }
  // byArgsMultiset (sorted multiset of atom argument roots)
  let byArgsMultiset = hg.byArgsMultiset;
  const rootsForMultiset: string[] = [];
  for (let i = 1; i <= argCount; i++) {
    const arg = edge.items[i] as any;
    if (isAtom(arg)) {
      const root = (arg as Atom).text.split("/")[0] ?? "";
      if (root) rootsForMultiset.push(root);
    }
  }
  if (rootsForMultiset.length > 0) {
    const keyMs = rootsForMultiset.sort().join("|");
    byArgsMultiset = addToIndex(byArgsMultiset, keyMs, key);
  }
  // byRootDepth (depth-aware indexing): atoms at distance from edge root
  let byRootDepth = hg.byRootDepth;
  const indexDepth = (node: Atom | Hedge, depth: number) => {
    if (isAtom(node)) {
      const root = (node as Atom).text.split("/")[0] ?? "";
      if (root) byRootDepth = addToNestedIndex(byRootDepth, depth, root, key);
      return;
    }
    const h = node as Hedge;
    for (const it of h.items as any) indexDepth(it as any, depth + 1);
  };
  indexDepth(edge as any, 0);
  return {
    kv,
    byConnector,
    byType,
    byRoot,
    byArgrole,
    byHeadAtom,
    attrs: hg.attrs,
    byArity,
    byArgroleSet,
    byArgRootN,
    byArgsMultiset,
    byRootDepth,
  };
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
  // byArity
  const arity = Math.max(0, (edge.items?.length ?? 1) - 1);
  const byArity = removeFromIndex(hg.byArity, String(arity), key);
  // byArgroleSet
  let byArgroleSet = hg.byArgroleSet;
  const rolesForSet = argrolesOf(edge);
  if (rolesForSet && rolesForSet.length > 0) {
    const letters =
      rolesForSet[0] === "{" ? rolesForSet.slice(1, -1) : rolesForSet;
    const norm = letters.replace(/[\s,]/g, "").split("").sort().join("");
    if (norm.length > 0)
      byArgroleSet = removeFromIndex(byArgroleSet, norm, key);
  }
  // byArgRootN
  let byArgRootN = hg.byArgRootN;
  const argCount = Math.max(0, (edge.items?.length ?? 1) - 1);
  for (let i = 1; i <= argCount; i++) {
    const arg = edge.items[i] as any;
    if (isAtom(arg)) {
      const root = (arg as Atom).text.split("/")[0] ?? "";
      if (root) byArgRootN = removeFromNestedIndex(byArgRootN, i, root, key);
    }
  }
  // byArgsMultiset
  let byArgsMultiset = hg.byArgsMultiset;
  const rootsForMultiset: string[] = [];
  for (let i = 1; i <= argCount; i++) {
    const arg = edge.items[i] as any;
    if (isAtom(arg)) {
      const root = (arg as Atom).text.split("/")[0] ?? "";
      if (root) rootsForMultiset.push(root);
    }
  }
  if (rootsForMultiset.length > 0) {
    const keyMs = rootsForMultiset.sort().join("|");
    byArgsMultiset = removeFromIndex(byArgsMultiset, keyMs, key);
  }
  // byRootDepth removal mirrors insertion
  let byRootDepth = hg.byRootDepth;
  const unindexDepth = (node: Atom | Hedge, depth: number) => {
    if (isAtom(node)) {
      const root = (node as Atom).text.split("/")[0] ?? "";
      if (root)
        byRootDepth = removeFromNestedIndex(byRootDepth, depth, root, key);
      return;
    }
    const h = node as Hedge;
    for (const it of h.items as any) unindexDepth(it as any, depth + 1);
  };
  unindexDepth(edge as any, 0);
  return {
    kv,
    byConnector,
    byType,
    byRoot,
    byArgrole,
    byHeadAtom,
    attrs: hg.attrs,
    byArity,
    byArgroleSet,
    byArgRootN,
    byArgsMultiset,
    byRootDepth,
  };
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

// Additional stream finders leveraging permutation-friendly indexes
export const streamByArgroleSet = (
  hg: Hypergraph,
  lettersNormalized: string
): Stream.Stream<Hedge> =>
  keysToEdgeStream(hg, keysFromIndex(hg.byArgroleSet, lettersNormalized));

export const streamByArgRootN = (
  hg: Hypergraph,
  position: number,
  root: string
): Stream.Stream<Hedge> =>
  keysToEdgeStream(hg, keysFromNestedIndex(hg.byArgRootN, position, root));

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

const keysFromNestedIndex = (
  nested: HashMap.HashMap<
    number,
    HashMap.HashMap<string, HashSet.HashSet<string>>
  >,
  position: number,
  key: string
): HashSet.HashSet<string> => {
  const inner = HashMap.get(nested, position);
  return inner._tag === "Some"
    ? keysFromIndex(inner.value, key)
    : HashSet.empty<string>();
};

const candidateKeysForPattern = (
  hg: Hypergraph,
  pattern: Hedge
): HashSet.HashSet<string> => {
  const candidateSets: Array<HashSet.HashSet<string>> = [];
  // connector
  const conn = pattern.items?.[0];
  let hasUnorderedRoles = false;
  if (conn && isAtom(conn as any)) {
    const text = (conn as Atom).text;
    if (isConcreteAtomText(text)) {
      candidateSets.push(keysFromIndex(hg.byConnector, text));
    }
    // detect unordered roles on connector (e.g., Pd.{os})
    const parts = text.split("/");
    if (parts.length > 1) {
      const typeParts = parts[1].split(".");
      if (typeParts.length > 1) {
        const roles = typeParts[1];
        hasUnorderedRoles = roles.length > 0 && roles[0] === "{";
      }
    }
  }
  // first arg (head)
  const arg1 = pattern.items?.[1];
  if (
    !hasUnorderedRoles &&
    arg1 &&
    isAtom(arg1 as any) &&
    isConcreteAtomText((arg1 as Atom).text)
  ) {
    const text = (arg1 as Atom).text;
    const root = text.split("/")[0] ?? "";
    const useRoot = text.includes("{") || text.includes(".");
    candidateSets.push(
      useRoot
        ? keysFromIndex(hg.byRoot, root)
        : keysFromIndex(hg.byHeadAtom, text)
    );
  }
  // detect unordered roles and add argrole indexes from head predicate (arg1)
  if (arg1 && isAtom(arg1 as any)) {
    const text = (arg1 as Atom).text;
    const parts = text.split("/");
    if (parts.length > 1) {
      const typeParts = parts[1].split(".");
      if (typeParts.length > 1) {
        const roles = typeParts[1];
        hasUnorderedRoles =
          hasUnorderedRoles || (roles.length > 0 && roles[0] === "{");
        const letters = roles[0] === "{" ? roles.slice(1, -1) : roles;
        for (const r of letters.replace(/[\,\s]/g, "")) {
          candidateSets.push(keysFromIndex(hg.byArgrole, r));
        }
        const norm = letters.replace(/[\s,]/g, "").split("").sort().join("");
        if (norm.length > 0)
          candidateSets.push(keysFromIndex(hg.byArgroleSet, norm));
      }
    }
  }
  // arity (number of args)
  const arity = Math.max(0, (pattern.items?.length ?? 1) - 1);
  candidateSets.push(keysFromIndex(hg.byArity, String(arity)));
  // any concrete atoms by root anywhere in pattern
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
    candidateSets.push(keysFromIndex(hg.byRoot, r));
  }
  // argroles on connector (letters)
  if (conn && isAtom(conn as any)) {
    const parts = (conn as Atom).text.split("/");
    if (parts.length > 1) {
      const typeParts = parts[1].split(".");
      if (typeParts.length > 1) {
        const roles = typeParts[1];
        const letters = roles[0] === "{" ? roles.slice(1, -1) : roles;
        for (const r of letters.replace(/[\,\s]/g, "")) {
          candidateSets.push(keysFromIndex(hg.byArgrole, r));
        }
        // normalized argrole set (unordered)
        const norm = letters.replace(/[\s,]/g, "").split("").sort().join("");
        if (norm.length > 0)
          candidateSets.push(keysFromIndex(hg.byArgroleSet, norm));
      }
    }
  }
  // positional argument roots (if concrete) only when ordered roles
  if (!hasUnorderedRoles) {
    for (let i = 1; i <= arity; i++) {
      const arg = pattern.items?.[i] as any;
      if (arg && isAtom(arg) && isConcreteAtomText((arg as Atom).text)) {
        const root = (arg as Atom).text.split("/")[0] ?? "";
        if (root)
          candidateSets.push(keysFromNestedIndex(hg.byArgRootN, i, root));
      }
    }
  }
  // multiset of argument roots (unordered)
  if (arity > 0) {
    const msRoots: string[] = [];
    for (let i = 1; i <= arity; i++) {
      const arg = pattern.items?.[i] as any;
      if (arg && isAtom(arg) && isConcreteAtomText((arg as Atom).text)) {
        msRoots.push((arg as Atom).text.split("/")[0] ?? "");
      }
    }
    if (msRoots.length > 0) {
      const keyMs = msRoots.sort().join("|");
      candidateSets.push(keysFromIndex(hg.byArgsMultiset, keyMs));
    }
  }
  // Selectivity: intersect non-empty sets starting from smallest
  const nonEmpty = candidateSets.filter((s) => HashSet.size(s) > 0);
  if (nonEmpty.length === 0) {
    // fallback: no selective hint → search all keys
    return HashSet.fromIterable(HashMap.keys(hg.kv.map));
  }
  nonEmpty.sort((a, b) => HashSet.size(a) - HashSet.size(b));
  let acc = nonEmpty[0]!;
  for (let i = 1; i < nonEmpty.length; i++) acc = intersect(acc, nonEmpty[i]!);
  return acc;
};

// ---------- Attributes API ----------

export const setAttribute = (
  hg: Hypergraph,
  edge: Hedge,
  attribute: string,
  value: string
): Hypergraph => {
  const key = toStr(edge);
  const current = HashMap.get(hg.attrs, key);
  const updated = HashMap.set(
    current._tag === "Some" ? current.value : HashMap.empty<string, string>(),
    attribute,
    value
  );
  return { ...hg, attrs: HashMap.set(hg.attrs, key, updated) };
};

export const getStrAttribute = (
  hg: Hypergraph,
  edge: Hedge,
  attribute: string,
  orElse: string | null = null
): string | null => {
  const key = toStr(edge);
  const mp = HashMap.get(hg.attrs, key);
  if (mp._tag === "None") return orElse;
  const v = HashMap.get(mp.value, attribute);
  return v._tag === "Some" ? v.value : orElse;
};

export const incAttribute = (
  hg: Hypergraph,
  edge: Hedge,
  attribute: string
): Hypergraph => {
  const cur = Number(getStrAttribute(hg, edge, attribute, "0") ?? 0);
  return setAttribute(hg, edge, attribute, String(cur + 1));
};

export const decAttribute = (
  hg: Hypergraph,
  edge: Hedge,
  attribute: string
): Hypergraph => {
  const cur = Number(getStrAttribute(hg, edge, attribute, "0") ?? 0);
  return setAttribute(hg, edge, attribute, String(cur - 1));
};

// ---------- Degree / Star ----------

export const star = (
  hg: Hypergraph,
  atomRootOrText: string
): Chunk.Chunk<Hedge> =>
  keysToEdgeStream(hg, keysFromIndex(hg.byRoot, atomRootOrText)).pipe(
    Stream.runCollect,
    Effect.runSync
  );

export const degree = (hg: Hypergraph, atomRootOrText: string): number =>
  HashSet.size(keysFromIndex(hg.byRoot, atomRootOrText));

// Deep degree: count of edges containing any occurrence (including nested) of a root
export const deepDegree = (hg: Hypergraph, atomRootOrText: string): number =>
  HashSet.size(keysFromIndex(hg.byRoot, atomRootOrText));

export const degreeAtDepth = (
  hg: Hypergraph,
  atomRootOrText: string,
  depth: number
): number =>
  HashSet.size(keysFromNestedIndex(hg.byRootDepth, depth, atomRootOrText));

export const streamByRootAtDepth = (
  hg: Hypergraph,
  atomRootOrText: string,
  depth: number
): Stream.Stream<Hedge> =>
  keysToEdgeStream(
    hg,
    keysFromNestedIndex(hg.byRootDepth, depth, atomRootOrText)
  );

// Simple sequence API using attributes and a sequence connector name
const SEQ_ATTR = "+/B/._seq_attrs";
const SEQ_CONN = "+/B/._seq";

export const addToSequence = (
  hg: Hypergraph,
  name: string,
  edge: Hedge,
  primary = true
): Hypergraph => {
  const sizeKey = `(${SEQ_ATTR} ${name})`;
  const currentSize = Number(
    HashMap.get(hg.attrs, sizeKey)
      .pipe((o) =>
        o._tag === "Some" ? o.value : HashMap.empty<string, string>()
      )
      .pipe((m) => HashMap.get(m, "size"))
      .pipe((o) => (o._tag === "Some" ? o.value : "0"))
  );
  // sequence edge holds: (SEQ_CONN name pos edge)
  const seqEdge = hedge([
    atom(SEQ_CONN),
    atom(name),
    atom(String(currentSize)),
    edge as any,
  ] as any);
  let nextHg = insert(hg, seqEdge);
  nextHg = setAttribute(
    nextHg,
    hedge([atom(SEQ_ATTR), atom(name)] as any),
    "size",
    String(currentSize + 1)
  );
  return nextHg;
};

export const sequence = (hg: Hypergraph, name: string): Chunk.Chunk<Hedge> =>
  streamByConnector(hg, SEQ_CONN)
    .pipe(Stream.runCollect, Effect.runSync)
    .pipe((c) =>
      Chunk.filter(
        c,
        (e) =>
          isAtom(e.items?.[1] as any) && (e.items?.[1] as any).text === name
      )
    )
    .pipe((c) => Chunk.map(c, (e) => e.items?.[3] as Hedge));
