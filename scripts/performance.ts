#!/usr/bin/env -S node --loader tsx
import { Effect, Chunk } from "effect";
import * as Stream from "effect/Stream";
import { NodeRuntime, NodeFileSystem } from "@effect/platform-node";
import { FileSystem } from "@effect/platform";
import * as HG from "../src/memory/Hypergraph.js";
import { checkCorrectness, typeOf } from "../src/hg/ops.js";
import { hedgeFromHypergraphString } from "../src/parser/adapter.js";
import { prettyPrint } from "../src/hg/pretty.js";
import { atom, hedge } from "../src/hg/model.js";

// Load CJS parser via dynamic import to keep tsx happy
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ProductionHypergraphParser } = await import(
  "../production_hypergraph_parser.cjs"
);

const readFileEffect = (filePath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* fs.readFileString(filePath);
  });

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

const bench = <A, E, R>(label: string, eff: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const start = Date.now();
    const result = yield* eff;
    const ms = Date.now() - start;
    console.log(`${label}: ${ms} ms`);
    return result;
  });

const program = (filePath: string, maxSentences: number, concurrency: number) =>
  Effect.gen(function* () {
    // Load file
    const raw = yield* bench(
      "load-file",
      readFileEffect(filePath).pipe(Effect.provide(NodeFileSystem.layer))
    );
    const sentencesAll = yield* bench("split-sentences", toSentences(raw));
    const sentences = sentencesAll.slice(0, maxSentences);

    // Init parser
    const parser = new ProductionHypergraphParser({
      enableBM25: true,
      enableEntityPreprocessing: true,
      enablePunctuationHandling: true,
      bm25: {
        cacheVectors: true,
      },
    });
    yield* bench(
      "parser-initialize",
      Effect.promise(() => parser.initialize())
    );

    // Parse concurrently
    const edges = yield* bench(
      `parse-sentences x${sentences.length} (conc=${concurrency})`,
      Effect.forEach(sentences, (s) => parseSentenceEffect(parser, s), {
        concurrency,
      })
    );

    // Build hypergraph
    let hg = yield* bench(
      "index-build",
      Effect.sync(() => {
        let acc = HG.make();
        for (const h of edges) if (validateEdge(h)) acc = HG.insert(acc, h!);
        return acc;
      })
    );

    console.log(`hypergraph edges: ${HG.size(hg)}`);

    // Query bench
    const patterns: ReadonlyArray<readonly [string, ReturnType<typeof hedge>]> =
      [
        [
          "any head with mary/C as 3rd arg",
          hedge([atom("*"), atom("*"), atom("mary/C")] as any),
        ],
        [
          "and/J with two args",
          hedge([atom("and/J"), atom("*"), atom("*")] as any),
        ],
        [
          ":/J/. with nested so/J",
          hedge([
            atom(":/J/."),
            hedge([atom("so/J"), atom("*")] as any) as any,
            atom("*"),
          ] as any),
        ],
        [
          "unordered hear/Pd.{os} pattern",
          hedge([
            atom("+/B/."),
            atom("hear/Pd.{os}"),
            atom("alice/C"),
            atom("bob/C"),
          ] as any),
        ],
      ];

    for (const [label, pat] of patterns) {
      const res = yield* bench(
        `query: ${label}`,
        Effect.succeed(HG.findByPattern(hg, pat))
      );
      console.log(`  matches: ${Chunk.size(res)}`);
    }

    // Stream sample
    const s = HG.streamByConnector(hg, "+/B/.").pipe(
      Stream.take(3),
      Stream.map((e) => prettyPrint(e, { width: 60, indent: 2 }))
    );
    console.log("sample stream (connector +/B/.):");
    const collected = yield* Stream.runCollect(s);
    for (const it of collected) console.log(it);
  });

const filePath = process.argv[2] ?? "data/texts/alice.txt";
const maxSentences = Number(process.argv[3] ?? 200);
const concurrency = Number(process.argv[4] ?? 8);

NodeRuntime.runMain(
  program(filePath, maxSentences, concurrency).pipe(
    Effect.provide(NodeFileSystem.layer)
  )
);
