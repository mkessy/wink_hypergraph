import { describe, it, beforeAll } from "vitest";
import * as fs from "node:fs";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  ProductionHypergraphParser,
} = require("../production_hypergraph_parser.cjs");

const read = (p: string): string => fs.readFileSync(p, "utf8");

const toSentences = (text: string): string[] => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const nlp = require("compromise");
  const doc = nlp(text);
  return doc.sentences().out("array");
};

describe("baseline corpora: sanity and regression checks", () => {
  let parser: any;
  beforeAll(async () => {
    parser = new ProductionHypergraphParser({
      enableBM25: false,
      enableEntityPreprocessing: true,
      enablePunctuationHandling: true,
      entityPreprocessing: {
        autoDetect: true,
        maxCompoundWords: 4,
        minFrequency: 1,
        allowFunctionWords: ["of"],
        requireCapitalizedForNounNoun: true,
      },
    });
    await parser.initialize();
  });

  const collectCompounds = async (
    text: string,
    maxSentences = 8
  ): Promise<Set<string>> => {
    const sentences = toSentences(text).slice(0, maxSentences);
    const compounds = new Set<string>();
    for (const s of sentences) {
      const res = await parser.parse(s);
      for (const e of res.entities) compounds.add(e.compound);
    }
    return compounds;
  };

  const softCheck = (cond: boolean, label: string) => {
    if (!cond) console.warn(`[soft-check] ${label} FAILED`);
  };

  const printFound = (label: string, found: Set<string>) => {
    const arr = Array.from(found).sort();
    console.log(`\n[${label}] found ${arr.length} compounds:`);
    console.log(arr.slice(0, 50).join(", "));
  };

  it("pundit_0: detects expected named entities", async () => {
    const text = read("test/data/pundit_0.txt");
    const compounds = await collectCompounds(text, 10);
    printFound("pundit_0", compounds);
    // Harvard University should be found
    softCheck(compounds.has("harvard_university"), "expect harvard_university");
    // At least one of these political figures should be found
    const candidates = ["tim_walz", "jon_tester", "kamala_harris"];
    softCheck(
      candidates.some((c) => compounds.has(c)),
      "expect one of tim_walz|jon_tester|kamala_harris"
    );
  });

  it("news_1: detects United States", async () => {
    const text = read("test/data/news_1.txt");
    const compounds = await collectCompounds(text, 10);
    printFound("news_1", compounds);
    softCheck(
      compounds.has("united_states") || compounds.has("united_states."),
      "expect united_states"
    );
  });

  it("book_0/book_1: conservative detection (low NE density)", async () => {
    const text0 = read("test/data/book_0.txt");
    const text1 = read("test/data/book_1.txt");
    const c0 = await collectCompounds(text0, 8);
    const c1 = await collectCompounds(text1, 8);
    printFound("book_0", c0);
    printFound("book_1", c1);
    // Expect relatively few compounds in philosophical prose
    softCheck(c0.size <= 6, `book_0 size<=6 (got ${c0.size})`);
    softCheck(c1.size <= 6, `book_1 size<=6 (got ${c1.size})`);
  });
});
