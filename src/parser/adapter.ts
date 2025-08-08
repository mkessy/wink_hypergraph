import { Hedge } from "../hg/model.js";
import { hedgeFromString } from "../hg/parse.js";
import { Effect, Option } from "effect";

// Convert a production parser hypergraph string to a typed Hedge
export const hedgeFromHypergraphString = (edgeStr: string): Hedge | null =>
  hedgeFromString(edgeStr);

// Convert production parser result object into Hedge using its hypergraphString
export const hedgeFromProduction = (
  hypergraph: unknown,
  hypergraphString?: string
): Hedge | null => {
  if (typeof hypergraphString === "string") {
    return hedgeFromHypergraphString(hypergraphString);
  }
  // Fallback: if hypergraph is already a string
  if (typeof (hypergraph as any) === "string") {
    return hedgeFromHypergraphString(hypergraph as any);
  }
  return null;
};

export interface ProductionLikeEffect {
  parse: (text: string) => Promise<{ hypergraphString: string }>;
}

// Wrap production parser.parse(text) into an Effect and decode to Hedge Option
export const parseSentenceEffect = (
  parser: ProductionLikeEffect,
  text: string
): Effect.Effect<Option.Option<Hedge>> =>
  Effect.map(
    Effect.promise(() => parser.parse(text)),
    (res) =>
      Option.fromNullable(hedgeFromHypergraphString(res.hypergraphString))
  );
