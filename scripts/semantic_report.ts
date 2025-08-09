#!/usr/bin/env -S node --loader tsx
import { NodeRuntime, NodeFileSystem } from "@effect/platform-node";
import { Effect } from "effect";
import { FileSystem } from "@effect/platform";
import * as HG from "../src/memory/Hypergraph.js";
import { hedgeFromHypergraphString } from "../src/parser/adapter.js";
import { analyzeEntities } from "../src/processors/entities/Extractor.js";
import { analyzePredicates } from "../src/processors/predicates/Extractor.js";
import { semanticCentrality } from "./util/semantic_centrality.js";
import { checkCorrectness, typeOf } from "../src/hg/ops.js";

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
    let hg = HG.make();
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
    for (const h of edges) if (validateEdge(h)) hg = HG.insert(hg, h);

    const entities = analyzeEntities(hg).slice(0, 10);
    console.log("Top entities:");
    for (const e of entities)
      console.log(
        `${e.root} total=${e.total} roles=${JSON.stringify(e.roles.counts)}`
      );

    const preds = analyzePredicates(hg).slice(0, 10);
    console.log("\nTop predicates:");
    for (const p of preds)
      console.log(
        `${p.root} total=${p.total} roles=${JSON.stringify(p.roles.counts)}`
      );

    const sc = semanticCentrality(hg, {
      roleWeights: { head: 1 },
      depthWeights: { 1: 1, 2: 0.5, 3: 0.25 },
    });
    console.log("\nSemantic centrality (entities/predicates):");
    for (const [label, top] of Object.entries(sc)) {
      console.log(label);
      for (const [root, score] of top) console.log(`  ${root}: ${score}`);
    }
  });

const filePath = process.argv[2] ?? "data/texts/alice.txt";
NodeRuntime.runMain(
  program(filePath).pipe(Effect.provide(NodeFileSystem.layer))
);
