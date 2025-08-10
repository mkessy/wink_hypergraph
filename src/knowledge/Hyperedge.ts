import { Data, Schema as S, ParseResult, Effect } from "effect";
import type { Hash } from "./Hash.js";
import { canonicalStringify } from "./Hash.js";
import * as HG from "../hg/model.js";
import { HedgeSchema } from "../hg/model.js";
import { hedgeFromString } from "../hg/parse.js";
import { toStr } from "../hg/print.js";

// Encoding marker interface
export interface HyperedgeEncoding {
  readonly _tag: string;
  readonly atoms: unknown; // shape per encoding
}

// Proof types
export class ProofHash extends Data.TaggedClass("ProofHash")<{
  readonly hash: Hash;
  readonly confidence: number;
}> {}

export class OperationRef extends Data.TaggedClass("OperationRef")<{
  readonly method: string;
  readonly params: unknown;
  readonly expected: string; // encoding tag expected
}> {}

export type Proof = ProofHash | OperationRef;

export interface Hyperedge<T extends HyperedgeEncoding> {
  readonly id: Hash;
  readonly encoding: T;
  readonly atoms: T["atoms"];
  readonly proof: Proof;
  readonly deps: ReadonlyArray<Hash | OperationRef>;
  readonly status: "proven" | "partial" | "pending";
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export const HyperedgeSchema = <TAtoms>() =>
  S.Struct({
    id: S.String, // Hash
    encoding: S.Struct({ _tag: S.String }) as any,
    atoms: S.Unknown as unknown as S.Schema<TAtoms>,
    proof: S.Union(
      S.Struct({
        _tag: S.Literal("ProofHash"),
        hash: S.String,
        confidence: S.Number,
      }),
      S.Struct({
        _tag: S.Literal("OperationRef"),
        method: S.String,
        params: S.Unknown,
        expected: S.String,
      })
    ) as any,
    deps: S.Array(
      S.Union(
        S.String, // Hash
        S.Struct({
          _tag: S.Literal("OperationRef"),
          method: S.String,
          params: S.Unknown,
          expected: S.String,
        })
      )
    ),
    status: S.Union(
      S.Literal("proven"),
      S.Literal("partial"),
      S.Literal("pending")
    ),
    metadata: S.optional(S.Record({ key: S.String, value: S.Unknown })),
  });

// A class-based schema for string-encoded hyperedges that can be transformed
// to and from our structured `HG.Hedge`. See: Schema.Class and transformations
// - https://effect.website/docs/schema/classes/
export class EncodedHyperedge extends S.Class<EncodedHyperedge>(
  "EncodedHyperedge"
)({
  id: S.String,
  type: S.String, // encoding tag (e.g., TraitEncoding)
  atoms: S.String, // string-encoded atoms payload
  proof: S.Unknown, // serialized Proof for transport
  deps: S.Array(S.Unknown),
  status: S.Union(
    S.Literal("proven"),
    S.Literal("partial"),
    S.Literal("pending")
  ),
  metadata: S.optional(S.Record({ key: S.String, value: S.Unknown })),
}) {
  // Convenience getter for canonical payload used in hashing
  get canonical(): string {
    return canonicalStringify({
      type: this.type,
      atoms: this.atoms,
      proof: this.proof,
      deps: this.deps,
      status: this.status,
    });
  }
}

// Transformations between string-encoded edge representation and structured hedge
// These are effectful contracts we can overload per domain encoding.
export const EncodedToHedge = S.transformOrFail(
  EncodedHyperedge,
  S.Struct({
    id: S.String,
    hedge: HedgeSchema as unknown as S.Schema<HG.Hedge>,
  }),
  {
    decode: (e) => {
      const h = hedgeFromString(e.atoms);
      return h
        ? Effect.succeed({ id: e.id, hedge: h as HG.Hedge })
        : Effect.fail(
            new ParseResult.Type(S.String.ast, e.atoms, "Invalid hedge string")
          );
    },
    encode: (s) =>
      Effect.succeed(
        new EncodedHyperedge({
          id: s.id,
          type: "Raw",
          atoms: toStr((s as any).hedge),
          proof: {},
          deps: [],
          status: "partial",
        })
      ),
  }
);
