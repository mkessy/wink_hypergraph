import { describe, it, expect } from "vitest";
import { Effect } from "effect";
import { KnowledgeStore, KnowledgeStoreLive } from "../src/knowledge/Store.js";

describe("KnowledgeStore pattern queries", () => {
  it("findByPatternEncoded returns matches", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const svc = yield* KnowledgeStore;
        // Insert a couple of edges
        yield* svc.putEncoded({
          id: "",
          type: "TraitEncoding",
          atoms: "(works/P alice/C acme/C)",
          proof: {},
          deps: [],
          status: "partial",
        });
        yield* svc.putEncoded({
          id: "",
          type: "TraitEncoding",
          atoms: "(works/P bob/C acme/C)",
          proof: {},
          deps: [],
          status: "partial",
        });
        // Query for works predicate
        const res = yield* svc.findByPatternEncoded("(works/P * *)");
        expect(res.length).toBeGreaterThan(0);
      }).pipe(Effect.provide(KnowledgeStoreLive))
    );
  });
});


