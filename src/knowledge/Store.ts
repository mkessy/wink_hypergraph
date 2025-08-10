import {
  Context,
  Effect,
  HashMap,
  HashSet,
  Layer,
  Ref,
  Schema as S,
  Metric,
} from "effect";
import { computeHash, type Hash } from "./Hash.js";
import {
  EncodedHyperedge,
  Hyperedge,
  HyperedgeEncoding,
  OperationRef,
} from "./Hyperedge.js";
import { NotFoundError, InvalidHedgeString } from "./Errors.js";
import { OperationRegistry } from "./Operations.js";
import { parseHedgeStringEffect } from "./HedgeString.js";
import * as MemoryHg from "../memory/Hypergraph.js";
import { toStr } from "../hg/print.js";
import { hedgeFromString } from "../hg/parse.js";

export class KnowledgeStore extends Context.Tag("KnowledgeStore")<
  KnowledgeStore,
  {
    readonly put: <T extends HyperedgeEncoding>(
      edge: Omit<Hyperedge<T>, "id"> & { id?: Hash }
    ) => Effect.Effect<Hash>;
    readonly get: (id: Hash) => Effect.Effect<Hyperedge<any>, NotFoundError>;
    // Encoded transport contracts
    readonly putEncoded: (encoded: unknown) => Effect.Effect<Hash>;
    readonly getEncoded: (
      id: Hash
    ) => Effect.Effect<EncodedHyperedge, NotFoundError>;
    readonly has: (id: Hash) => Effect.Effect<boolean>;
    readonly remove: (id: Hash) => Effect.Effect<void>;
    readonly byType: (
      encodingTag: string
    ) => Effect.Effect<ReadonlyArray<Hyperedge<any>>>;
    readonly listByTypeEncoded: (
      encodingTag: string
    ) => Effect.Effect<ReadonlyArray<EncodedHyperedge>>;
    readonly findByPatternEncoded: (
      patternText: string
    ) => Effect.Effect<ReadonlyArray<EncodedHyperedge>, InvalidHedgeString>;
    readonly all: () => Effect.Effect<ReadonlyArray<Hyperedge<any>>>;
    readonly resolvePending: (options?: {
      readonly concurrency?: number;
    }) => Effect.Effect<number, never, OperationRegistry>;
  }
>() {}

// Deprecated: use NotFoundError

type InternalState = {
  readonly map: HashMap.HashMap<Hash, Hyperedge<any>>;
  readonly byType: HashMap.HashMap<string, HashSet.HashSet<Hash>>;
};

const emptyState = (): InternalState => ({
  map: HashMap.empty(),
  byType: HashMap.empty(),
});

const indexAdd = (
  state: InternalState,
  edge: Hyperedge<any>
): InternalState => {
  const tag = edge.encoding._tag;
  const setOpt = HashMap.get(state.byType, tag);
  const set = setOpt._tag === "Some" ? setOpt.value : HashSet.empty<Hash>();
  const nextSet = HashSet.add(set, edge.id);
  return { ...state, byType: HashMap.set(state.byType, tag, nextSet) };
};

const indexRemove = (
  state: InternalState,
  edge: Hyperedge<any>
): InternalState => {
  const tag = edge.encoding._tag;
  const setOpt = HashMap.get(state.byType, tag);
  if (setOpt._tag === "None") return state;
  const nextSet = HashSet.remove(setOpt.value, edge.id);
  const byType =
    HashSet.size(nextSet) === 0
      ? HashMap.remove(state.byType, tag)
      : HashMap.set(state.byType, tag, nextSet);
  return { ...state, byType };
};

export const KnowledgeStoreLive: Layer.Layer<KnowledgeStore> = Layer.effect(
  KnowledgeStore,
  Effect.gen(function* () {
    const ref = yield* Ref.make<InternalState>(emptyState());

    const read = <A>(f: (s: InternalState) => A): Effect.Effect<A> =>
      Ref.get(ref).pipe(Effect.map(f));

    const modify = <A>(
      f: (s: InternalState) => [InternalState, A]
    ): Effect.Effect<A> =>
      Ref.modify(ref, (s) => {
        const [next, out] = f(s);
        return [out, next] as const;
      });

    // metrics
    const putCounter = Metric.counter("knowledge_put_total");
    const getCounter = Metric.counter("knowledge_get_total");
    const putEncodedCounter = Metric.counter("knowledge_put_encoded_total");
    const byTypeCounter = Metric.counter("knowledge_by_type_total");
    const resolveCounter = Metric.counter("knowledge_resolve_pending_total");

    return KnowledgeStore.of({
      put: (edge) =>
        modify((s) => {
          const id =
            edge.id ??
            computeHash({
              encoding: (edge.encoding as any)._tag,
              atoms: edge.atoms,
            });
          const full = { ...edge, id } as Hyperedge<any>;
          const map = HashMap.set(s.map, id, full);
          const withIdx = indexAdd({ ...s, map }, full);
          return [withIdx, id];
        }).pipe(Effect.tap(() => Metric.increment(putCounter))),

      get: (id) =>
        read((s) => HashMap.get(s.map, id)).pipe(
          Effect.flatMap((o) =>
            o._tag === "Some"
              ? Effect.succeed(o.value)
              : Effect.fail(
                  new NotFoundError({
                    id,
                    message: `KnowledgeStore: not found ${id}`,
                  })
                )
          ),
          Effect.tap(() => Metric.increment(getCounter))
        ),

      putEncoded: (unknownEncoded) =>
        modify((s) => {
          const decode = S.decodeUnknownSync(EncodedHyperedge as any);
          const encoded = decode(unknownEncoded) as InstanceType<
            typeof EncodedHyperedge
          >;
          const id = computeHash((encoded as any).canonical);
          const edge: Hyperedge<any> = {
            id,
            encoding: { _tag: (encoded as any).type } as any,
            atoms: (encoded as any).atoms,
            proof: (encoded as any).proof,
            deps: (encoded as any).deps,
            status: (encoded as any).status,
            metadata: (encoded as any).metadata,
          };
          const map = HashMap.set(s.map, id, edge);
          const withIdx = indexAdd({ ...s, map }, edge);
          return [withIdx, id];
        }).pipe(Effect.tap(() => Metric.increment(putEncodedCounter))),

      getEncoded: (id) =>
        read((s) => HashMap.get(s.map, id)).pipe(
          Effect.flatMap((o) => {
            if (o._tag === "None")
              return Effect.fail(
                new NotFoundError({
                  id,
                  message: `KnowledgeStore: not found ${id}`,
                })
              );
            const stored = o.value;
            const encoded = new (EncodedHyperedge as any)({
              id: stored.id,
              type: (stored.encoding as any)._tag,
              atoms: stored.atoms,
              proof: (stored as any).proof ?? {},
              deps: (stored as any).deps ?? [],
              status: (stored as any).status ?? "partial",
              metadata: (stored as any).metadata,
            });
            return Effect.succeed(encoded);
          })
        ),

      has: (id) => read((s) => HashMap.has(s.map, id)),

      remove: (id) =>
        modify((s) => {
          const cur = HashMap.get(s.map, id);
          if (cur._tag === "None") return [s, void 0];
          const map = HashMap.remove(s.map, id);
          const withIdx = indexRemove({ ...s, map }, cur.value);
          return [withIdx, void 0];
        }),

      byType: (encodingTag) =>
        read((s) => {
          const setOpt = HashMap.get(s.byType, encodingTag);
          if (setOpt._tag === "None")
            return [] as ReadonlyArray<Hyperedge<any>>;
          const out: Array<Hyperedge<any>> = [];
          for (const id of HashSet.values(setOpt.value)) {
            const v = HashMap.get(s.map, id);
            if (v._tag === "Some") out.push(v.value);
          }
          return out as ReadonlyArray<Hyperedge<any>>;
        }).pipe(Effect.tap(() => Metric.increment(byTypeCounter))),

      listByTypeEncoded: (encodingTag) =>
        read((s) => {
          const setOpt = HashMap.get(s.byType, encodingTag);
          if (setOpt._tag === "None") return [] as const;
          const out: Array<any> = [];
          for (const id of HashSet.values(setOpt.value)) {
            const v = HashMap.get(s.map, id);
            if (v._tag === "Some") {
              const e = v.value;
              out.push(
                new (EncodedHyperedge as any)({
                  id: e.id,
                  type: (e.encoding as any)._tag,
                  atoms: e.atoms,
                  proof: (e as any).proof ?? {},
                  deps: (e as any).deps ?? [],
                  status: (e as any).status ?? "partial",
                  metadata: (e as any).metadata,
                })
              );
            }
          }
          return out as any;
        }),

      all: () => read((s) => Array.from(HashMap.values(s.map))),

      resolvePending: (options) =>
        Effect.gen(function* () {
          const concurrency = options?.concurrency ?? 5;
          // Snapshot pending edges
          const pending = yield* read((s) =>
            Array.from(HashMap.values(s.map)).filter(
              (e: any) =>
                e.status !== "proven" &&
                e.proof &&
                (e.proof as any)._tag === "OperationRef"
            )
          );
          const results = yield* Effect.forEach(
            pending,
            (edge) =>
              Effect.gen(function* () {
                const registry = yield* OperationRegistry;
                const resolved = yield* registry.execute(
                  (edge as any).proof as OperationRef
                );
                // Write back proven edge, preserving id and type
                yield* modify((s) => {
                  const previous = HashMap.get(s.map, (edge as any).id);
                  const base = previous._tag === "Some" ? previous.value : edge;
                  const updated: Hyperedge<any> = {
                    ...resolved,
                    id: (edge as any).id,
                    encoding: base.encoding,
                    status: (resolved as any).status ?? "proven",
                  } as any;
                  // reindex if needed
                  const removed = indexRemove(s, base as any);
                  const map = HashMap.set(removed.map, updated.id, updated);
                  const withIdx = indexAdd({ ...removed, map }, updated);
                  return [withIdx, void 0];
                });
                return 1;
              }).pipe(Effect.catchAll(() => Effect.succeed(0))),
            { concurrency }
          );
          const count = results.reduce((a, b) => a + b, 0);
          // Increment once; if needed, replace with a histogram/gauge later
          yield* Metric.increment(resolveCounter);
          return count;
        }),

      findByPatternEncoded: (patternText) =>
        Effect.gen(function* () {
          const pattern = yield* parseHedgeStringEffect(patternText);
          const { map } = yield* read((s) => ({ map: s.map }));
          let hg = MemoryHg.make();
          const keyToId = new Map<string, string>();
          for (const e of HashMap.values(map)) {
            const atomsText = (e as any).atoms as string;
            const h = hedgeFromString(atomsText);
            if (h) {
              hg = MemoryHg.insert(hg, h);
              keyToId.set(toStr(h), (e as any).id);
            }
          }
          const matches = Array.from(MemoryHg.findByPattern(hg, pattern));
          const out: Array<EncodedHyperedge> = [] as any;
          for (const h of matches) {
            const id = keyToId.get(toStr(h));
            if (!id) continue;
            const opt = HashMap.get(map, id);
            if (opt._tag === "Some") {
              const e = opt.value;
              out.push(
                new (EncodedHyperedge as any)({
                  id: e.id,
                  type: (e.encoding as any)._tag,
                  atoms: (e as any).atoms,
                  proof: (e as any).proof ?? {},
                  deps: (e as any).deps ?? [],
                  status: (e as any).status ?? "partial",
                  metadata: (e as any).metadata,
                })
              );
            }
          }
          return out as any;
        }),
    });
  })
);
