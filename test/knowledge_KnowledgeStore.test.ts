import { describe, it, expect } from "vitest";
import { Effect, Layer } from "effect";
import { KnowledgeStore, KnowledgeStoreLive } from "../src/knowledge/Store.js";
import { OperationRegistryLive } from "../src/knowledge/Operations.js";

// noop

describe("KnowledgeStore", () => {
  it("put/get structured and encoded", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const svc = yield* KnowledgeStore;
        const edge = {
          encoding: { _tag: "TraitEncoding" },
          atoms: "(is/P john/C tall/C)",
          proof: {},
          deps: [],
          status: "partial" as const,
        } as any;
        const id1 = yield* svc.put(edge);
        const got = yield* svc.get(id1);
        expect(got.id).toBe(id1);

        const id2 = yield* svc.putEncoded({
          id: "",
          type: "TraitEncoding",
          atoms: "(is/P john/C tall/C)",
          proof: {},
          deps: [],
          status: "partial",
        });
        const enc = yield* svc.getEncoded(id2);
        expect(enc.type).toBe("TraitEncoding");

        const list = yield* svc.listByTypeEncoded("TraitEncoding");
        expect(list.length).toBeGreaterThan(0);
      }).pipe(Effect.provide(KnowledgeStoreLive))
    );
  });

  it("resolvePending runs handlers and writes back", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const svc = yield* KnowledgeStore;
        const pending = {
          encoding: { _tag: "TraitEncoding" },
          atoms: "(works/P alice/C acme/C)",
          proof: {
            _tag: "OperationRef",
            method: "prove",
            params: {},
            expected: "TraitEncoding",
          },
          deps: [],
          status: "pending" as const,
        } as any;
        yield* svc.put(pending);
        const count = yield* svc.resolvePending({ concurrency: 1 });
        expect(count).toBeGreaterThan(0);
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            KnowledgeStoreLive,
            OperationRegistryLive([
              [
                "prove",
                () =>
                  Effect.succeed({
                    encoding: { _tag: "TraitEncoding" },
                    atoms: "(works/P alice/C acme/C)",
                    proof: {
                      _tag: "ProofHash",
                      hash: "deadbeef",
                      confidence: 1,
                    },
                    deps: [],
                    status: "proven" as const,
                  } as any),
              ],
            ])
          )
        )
      )
    );
  });
});
