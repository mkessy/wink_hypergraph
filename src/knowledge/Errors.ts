import { Cause, Data, ParseResult } from "effect";

export class NotFoundError extends Data.TaggedError("NotFoundError")<{
  readonly id: string;
  readonly message: string;
}> {}

export class InvalidHedgeString extends Data.TaggedError("InvalidHedgeString")<{
  readonly input: string;
  readonly message: string;
  readonly cause: Cause.Cause<ParseResult.ParseError>;
}> {}

export class InvalidEncodedHyperedge extends Data.TaggedError(
  "InvalidEncodedHyperedge"
)<{
  readonly input: unknown;
  readonly message: string;
  readonly cause: Cause.Cause<ParseResult.ParseError>;
}> {}
