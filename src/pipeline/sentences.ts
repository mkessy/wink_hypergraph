import { Chunk, Effect } from "effect";
import { Hedge } from "../hg/model.js";
import { hedgeFromHypergraphString } from "../parser/adapter.js";
import * as HG from "../memory/Hypergraph.js";

export interface ProductionLike {
  parse: (text: string) => Promise<{ hypergraphString: string }>;
}

// Data-first: given a sentence list and a production-like parser, parse each independently
export const parseSentences = (
  sentences: ReadonlyArray<string>,
  parser: ProductionLike
): Effect.Effect<Chunk.Chunk<Hedge>> =>
  Effect.forEach(sentences, (s) => Effect.promise(() => parser.parse(s)), {
    concurrency: "unbounded",
  }).pipe(
    Effect.map((results) =>
      results.reduce((acc, r) => {
        const h = hedgeFromHypergraphString(r.hypergraphString);
        return h ? Chunk.append(acc, h) : acc;
      }, Chunk.empty<Hedge>())
    )
  );

// Build a Hypergraph from sentences via the production parser
export const hypergraphFromSentences = (
  sentences: ReadonlyArray<string>,
  parser: ProductionLike,
  initial?: HG.Hypergraph
): Effect.Effect<HG.Hypergraph> =>
  parseSentences(sentences, parser).pipe(
    Effect.map((edges) => {
      let hg = initial ?? HG.make();
      for (const e of edges) hg = HG.insert(hg, e);
      return hg;
    })
  );
