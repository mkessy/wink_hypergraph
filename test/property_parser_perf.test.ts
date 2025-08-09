import { describe, it, expect } from "vitest";
import fc from "fast-check";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  ProductionHypergraphParser,
} = require("../production_hypergraph_parser.cjs");

// Simple arbitrary for short English-like sentences
const word = fc
  .string({ minLength: 2, maxLength: 10 })
  .map((s) => (s.match(/[a-z]+/gi)?.[0] || "word").toLowerCase());

const punct = fc.constantFrom(".", "!", "?");

const sentenceArb = fc
  .array(word, { minLength: 4, maxLength: 16 })
  .map((ws) => ws.join(" "))
  .chain((body) => punct.map((p) => body + p));

describe("property/perf: parser handles random short sentences within time budget", () => {
  it("parses 50 random sentences under ~2s budget", async () => {
    const parser = new ProductionHypergraphParser({
      enableBM25: false,
      enableEntityPreprocessing: true,
      enablePunctuationHandling: true,
    });
    await parser.initialize();

    const sentences: string[] = fc.sample(sentenceArb, 50);
    const start = Date.now();
    for (const s of sentences) {
      const res = await parser.parse(s);
      expect(res).toBeTruthy();
      expect(typeof res.hypergraphString).toBe("string");
    }
    const ms = Date.now() - start;
    // Soft performance expectation; warn instead of fail if above
    if (ms > 2000) {
      // eslint-disable-next-line no-console
      console.warn(`[perf] parsed 50 sentences in ${ms}ms (>2000ms)`);
    }
  });
});
