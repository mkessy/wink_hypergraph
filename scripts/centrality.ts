#!/usr/bin/env -S node --loader tsx
import { NodeRuntime, NodeFileSystem } from "@effect/platform-node";
import { Effect, Chunk } from "effect";
import { FileSystem } from "@effect/platform";
import * as HG from "../src/memory/Hypergraph.js";
import { hedgeFromHypergraphString } from "../src/parser/adapter.js";
import { prettyPrint } from "../src/hg/pretty.js";
import { atom, hedge } from "../src/hg/model.js";
import { checkCorrectness, typeOf } from "../src/hg/ops.js";
import {
  degreeCentrality,
  degreeAtDepthCentrality,
  weightedDepthCentrality,
  topK,
  normalizeScores,
} from "../src/analytics/Centrality.js";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ProductionHypergraphParser } = await import(
  "../production_hypergraph_parser.cjs"
);

const toSentences = (text: string) =>
  Effect.gen(function* () {
    const nlp = yield* Effect.promise(() => import("compromise"));
    const doc = nlp.default(text);
    return doc.sentences().out("array") as string[];
  });

const parseSentenceEffect = (parser: any, s: string) =>
  Effect.map(
    Effect.promise(
      () => parser.parse(s) as Promise<{ hypergraphString: string }>
    ),
    (res) => hedgeFromHypergraphString(res.hypergraphString)
  );

const validateEdge = (h: any): boolean => {
  if (!h) return false;
  const text = JSON.stringify(h);
  if (text.includes("/unknown") || text.includes("//")) return false;
  try {
    typeOf(h as any);
  } catch (_) {
    return false;
  }
  try {
    const errs = checkCorrectness(h as any);
    if (errs.length > 0) return false;
  } catch (_) {
    return false;
  }
  return true;
};

const buildHypergraph = (edges: Array<any>) =>
  Effect.sync(() => {
    let hg = HG.make();
    for (const h of edges) if (validateEdge(h)) hg = HG.insert(hg, h);
    return hg;
  });

const program = (filePath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const raw = yield* fs.readFileString(filePath);
    const sentences = yield* toSentences(raw);
    const parser = new ProductionHypergraphParser({
      enableBM25: false,
      enableEntityPreprocessing: true,
      enablePunctuationHandling: true,
    });
    yield* Effect.promise(() => parser.initialize());
    const edges = yield* Effect.forEach(
      sentences,
      (s) => parseSentenceEffect(parser, s),
      { concurrency: 8 }
    );
    const hg = yield* buildHypergraph(edges);

    const deg = degreeCentrality(hg);
    const degTop = topK(deg, 10);
    console.log("Top-10 by degree:");
    for (const [root, score] of degTop) console.log(`${root}: ${score}`);

    const dd2 = degreeAtDepthCentrality(hg, 2);
    const dd2Top = topK(dd2, 10);
    console.log("\nTop-10 at depth=2:");
    for (const [root, score] of dd2Top) console.log(`${root}: ${score}`);

    const weighted = weightedDepthCentrality(hg, { 1: 1, 2: 0.5, 3: 0.25 });
    const weightedTop = topK(normalizeScores(weighted), 10);
    console.log("\nTop-10 weighted (1.0,0.5,0.25):");
    for (const [root, score] of weightedTop)
      console.log(`${root}: ${score.toFixed(3)}`);
  });

const filePath = process.argv[2] ?? "data/texts/alice.txt";
NodeRuntime.runMain(
  program(filePath).pipe(Effect.provide(NodeFileSystem.layer))
);
