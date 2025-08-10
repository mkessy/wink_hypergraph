import { describe, it, expect } from "vitest";
import { Effect, Either } from "effect";
import { parseHedgeStringEffect } from "../src/knowledge/HedgeString.js";

describe("HedgeString", () => {
  it("decodes valid strings", async () => {
    const program = parseHedgeStringEffect("(and/J a/C b/C)");
    const result = await Effect.runPromise(program);
    expect(result).toBeTruthy();
  });

  it("fails via InvalidHedgeString for invalid structure", async () => {
    const program = Effect.either(parseHedgeStringEffect("(and/J a/C b/C"));
    const res = await Effect.runPromise(program);
    expect(Either.isLeft(res)).toBe(true);
    if (Either.isLeft(res)) {
      // tagged domain error
      expect((res.left as any)._tag).toBe("InvalidHedgeString");
    }
  });
});
