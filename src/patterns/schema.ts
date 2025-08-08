import { Schema as S } from "effect";

// Wildcard tokens as precise literals (data-first, effect style)
export const WildcardSchema = S.Union(
  S.Literal("*"),
  S.Literal("."),
  S.Literal("(*)")
);
export type Wildcard = S.Schema.Type<typeof WildcardSchema>;

// Unordered argroles marker inside atom text, e.g. "Pd.{so}" or "{os}"
export const UnorderedArgrolesTextSchema = S.String.pipe(
  S.filter((s) => s.includes("{") && s.includes("}"), {
    message: () => "must include '{' and '}' to mark unordered argroles",
  })
);

// Pattern atom text is either a wildcard or contains unordered argroles
export const PatternAtomTextSchema = S.Union(
  WildcardSchema,
  UnorderedArgrolesTextSchema
);

export const isWildcardText = S.is(WildcardSchema);
export const isPatternText = S.is(PatternAtomTextSchema);
