import { Context, Effect, Layer, Ref, Option } from "effect";
import * as Stream from "effect/Stream";
import type { Hedge } from "../hg/model.js";
import * as MemoryHg from "../memory/Hypergraph.js";

/**
 * Effect-native Hypergraph storage service.
 * Wraps the existing in-memory indices with a Context service and Live Layer.
 *
 * This service is the seam where a DB-backed implementation can be swapped in later.
 */
export class HypergraphStore extends Context.Tag("HypergraphStore")<
  HypergraphStore,
  {
    readonly insert: (edge: Hedge) => Effect.Effect<void>;
    readonly remove: (edge: Hedge) => Effect.Effect<void>;
    readonly has: (edge: Hedge) => Effect.Effect<boolean>;
    readonly size: () => Effect.Effect<number>;
    readonly values: () => Effect.Effect<ReadonlyArray<Hedge>>;
    readonly getByKey: (key: string) => Effect.Effect<Option.Option<Hedge>>;
    readonly findByConnector: (
      connectorKey: string
    ) => Effect.Effect<ReadonlyArray<Hedge>>;
    readonly findByType: (
      typeKey: string
    ) => Effect.Effect<ReadonlyArray<Hedge>>;
    readonly findByPattern: (
      pattern: Hedge
    ) => Effect.Effect<ReadonlyArray<Hedge>>;
    readonly streamAll: () => Stream.Stream<Hedge>;
    readonly streamByConnector: (connectorKey: string) => Stream.Stream<Hedge>;
    readonly streamByType: (typeKey: string) => Stream.Stream<Hedge>;
    readonly streamByRoot: (root: string) => Stream.Stream<Hedge>;
    readonly streamByPattern: (pattern: Hedge) => Stream.Stream<Hedge>;
    readonly setAttribute: (
      edge: Hedge,
      attribute: string,
      value: string
    ) => Effect.Effect<void>;
    readonly getStrAttribute: (
      edge: Hedge,
      attribute: string,
      orElse?: string | null
    ) => Effect.Effect<string | null>;
  }
>() {}

/**
 * In-memory, index-rich implementation using src/memory/Hypergraph.ts
 */
export const HypergraphStoreLive: Layer.Layer<HypergraphStore> = Layer.effect(
  HypergraphStore,
  Effect.gen(function* () {
    const ref = yield* Ref.make(MemoryHg.make());

    const update = <A>(
      f: (hg: MemoryHg.Hypergraph) => [MemoryHg.Hypergraph, A]
    ): Effect.Effect<A> =>
      Ref.modify(ref, (hg) => {
        const [next, out] = f(hg);
        return [out, next] as const;
      });

    const read = <A>(f: (hg: MemoryHg.Hypergraph) => A): Effect.Effect<A> =>
      Ref.get(ref).pipe(Effect.map(f));

    return HypergraphStore.of({
      insert: (edge) => update((hg) => [MemoryHg.insert(hg, edge), void 0]),

      remove: (edge) => update((hg) => [MemoryHg.remove(hg, edge), void 0]),

      has: (edge) => read((hg) => MemoryHg.get(hg, edge)._tag === "Some"),

      size: () => read((hg) => MemoryHg.size(hg)),

      values: () => read((hg) => MemoryHg.values(hg)),

      getByKey: (key) => read((hg) => MemoryHg.getByKey(hg, key)),

      findByConnector: (connectorKey) =>
        read((hg) => Array.from(MemoryHg.findByConnector(hg, connectorKey))),

      findByType: (typeKey) =>
        read((hg) => Array.from(MemoryHg.findByType(hg, typeKey))),

      findByPattern: (pattern) =>
        read((hg) => Array.from(MemoryHg.findByPattern(hg, pattern))),

      streamAll: () => Stream.unwrap(read((hg) => MemoryHg.streamAll(hg))),

      streamByConnector: (connectorKey) =>
        Stream.unwrap(
          read((hg) => MemoryHg.streamByConnector(hg, connectorKey))
        ),

      streamByType: (typeKey) =>
        Stream.unwrap(read((hg) => MemoryHg.streamByType(hg, typeKey))),

      streamByRoot: (root) =>
        Stream.unwrap(read((hg) => MemoryHg.streamByRoot(hg, root))),

      streamByPattern: (pattern) =>
        Stream.unwrap(read((hg) => MemoryHg.streamByPattern(hg, pattern))),

      setAttribute: (edge, attribute, value) =>
        update((hg) => [
          MemoryHg.setAttribute(hg, edge, attribute, value),
          void 0,
        ]),

      getStrAttribute: (edge, attribute, orElse = null) =>
        read((hg) => MemoryHg.getStrAttribute(hg, edge, attribute, orElse)),
    });
  })
);
