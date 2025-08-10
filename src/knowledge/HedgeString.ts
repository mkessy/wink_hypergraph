import { Schema as S, Effect, ParseResult } from "effect";
import type { Hedge } from "../hg/model.js";
import { HedgeSchema } from "../hg/model.js";
import { hedgeFromString } from "../hg/parse.js";
import { toStr } from "../hg/print.js";
import { InvalidHedgeString } from "./Errors.js";

// Contract-first encoded hedge string using Schema.Class
export class HedgeString extends S.Class<HedgeString>("HedgeString")({
  value: S.String,
}) {}

// Pure transformation between HedgeString and structured Hedge
// See: https://effect.website/docs/schema/classes/#class-schemas-are-transformations
export const HedgeStringToHedge = S.transformOrFail(
  HedgeString,
  HedgeSchema as unknown as S.Schema<Hedge>,
  {
    decode: (s) => {
      const h = hedgeFromString(s.value);
      return h
        ? Effect.succeed(h as Hedge)
        : Effect.fail(
            new ParseResult.Type(S.String.ast, s.value, "Invalid hedge string")
          );
    },
    encode: (h) => Effect.succeed(new HedgeString({ value: toStr(h) })),
  }
);

export const decodeHedgeString = S.decodeUnknownSync(HedgeString);
export const encodeHedgeString = S.encodeSync(HedgeString);

export const parseHedgeStringEffect = (
  text: string
): Effect.Effect<Hedge, InvalidHedgeString> =>
  // Pre-validate simple parenthesis balance to surface clear domain error
  // before falling back to atom parsing, so invalid structures are rejected.
  Effect.flatMap(
    Effect.sync(() => {
      let depth = 0;
      for (const c of text) {
        if (c === "(") depth += 1;
        else if (c === ")") {
          depth -= 1;
          if (depth < 0) return false;
        }
      }
      return depth === 0;
    }),
    (ok) =>
      ok
        ? (S.decodeUnknown(HedgeStringToHedge)({
            value: text,
          }) as Effect.Effect<Hedge, ParseResult.ParseError>)
        : (Effect.fail(
            new ParseResult.Type(
              S.String.ast,
              text,
              "Invalid hedge string"
            ) as unknown as ParseResult.ParseError
          ) as Effect.Effect<never, ParseResult.ParseError>)
  ).pipe(
    Effect.mapError(
      (pe) =>
        new InvalidHedgeString({
          input: text,
          message: "Invalid hedge string",
          cause: pe as any,
        })
    )
  );
