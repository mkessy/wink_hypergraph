import { describe, it, expect } from "vitest";
import { Schema as S, Effect } from "effect";
import { KnowledgeStore, KnowledgeStoreLive } from "../src/knowledge/Store.js";
import { EncodedHyperedge } from "../src/knowledge/Hyperedge.js";

describe("EncodedHyperedge", () => {
  it("encode → decode → encode stability", () => {
    const input = {
      id: "",
      type: "TraitEncoding",
      atoms: "(is/P john/C tall/C)",
      proof: {},
      deps: [],
      status: "partial" as const,
    };
    const decode = S.decodeUnknownSync(EncodedHyperedge as any);
    const encode = S.encodeSync(EncodedHyperedge as any);
    const decoded = decode(input);
    const re = encode(decoded);
    expect(re).toEqual({ ...input, metadata: undefined });
  });

  it("invalid input maps to InvalidEncodedHyperedge", async () => {
    const eff = Effect.gen(function* () {
      const svc = yield* KnowledgeStore;
      // missing fields
      return yield* svc.putEncoded({} as any);
    }).pipe(Effect.provide(KnowledgeStoreLive), Effect.either);
    const res = await Effect.runPromise(eff);
    expect(res._tag).toBe("Left");
    if (res._tag === "Left") {
      expect((res.left as any)._tag).toBe("InvalidEncodedHyperedge");
    }
  });
});
