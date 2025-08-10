import { Context, Effect, HashMap, Layer } from "effect";
import type { Hyperedge, OperationRef } from "./Hyperedge.js";

export type OperationHandler = (
  ref: OperationRef
) => Effect.Effect<Hyperedge<any>>;

export class OperationRegistry extends Context.Tag("OperationRegistry")<
  OperationRegistry,
  {
    readonly execute: (
      ref: OperationRef
    ) => Effect.Effect<Hyperedge<any>, Error>;
    readonly has: (method: string) => Effect.Effect<boolean>;
  }
>() {}

export const OperationRegistryLive = (
  handlers: ReadonlyArray<readonly [string, OperationHandler]>
): Layer.Layer<OperationRegistry> =>
  Layer.effect(
    OperationRegistry,
    Effect.gen(function* () {
      const map = handlers.reduce(
        (acc, [k, v]) => HashMap.set(acc, k, v),
        HashMap.empty<string, OperationHandler>()
      );
      return OperationRegistry.of({
        execute: (ref) => {
          const h = HashMap.get(map, ref.method);
          if (h._tag === "None") {
            return Effect.fail(
              new Error(`No operation handler for method: ${ref.method}`)
            );
          }
          return h.value(ref);
        },
        has: (method) => Effect.succeed(HashMap.has(map, method)),
      });
    })
  );
