import { Schema as S, Data } from "effect";
import { AtomSchema, HedgeSchema } from "./model.js";
import { hedgeFromString } from "./parse.js";
import { toStr } from "./print.js";

export const decodeAtom = S.decodeUnknownSync(AtomSchema);
export const encodeAtom = S.encodeSync(AtomSchema);

export const decodeHedge = S.decodeUnknownSync(HedgeSchema);
export const encodeHedge = S.encodeSync(HedgeSchema);

// Tagged parse error type
export class ParseError extends Data.TaggedError("ParseError")<{
  message: string;
}> {}

// Transform string <-> Hedge (non-strict for now; assumes valid input)
export const EdgeStringSchema = S.transform(S.String, HedgeSchema, {
  decode: (s: string) => hedgeFromString(s) as any,
  encode: (h) => toStr(h as any),
  strict: false,
});

export const decodeEdgeString = S.decodeUnknownSync(EdgeStringSchema);
export const encodeEdgeString = S.encodeSync(EdgeStringSchema);
