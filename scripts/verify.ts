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

// CJS parser
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
    // use compromise for simplicity here; parser internally uses it too
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
    const raw = yield* readFileEffect(filePath);
    const sentences = yield* toSentences(raw); // cap for demo

    const parser = new ProductionHypergraphParser({
      enableBM25: true,
      enableEntityPreprocessing: true,
      enablePunctuationHandling: true,
    });
    yield* Effect.promise(() => parser.initialize());

    // Parse sentences concurrently
    const edges = yield* Effect.forEach(
      sentences,
      (s) => parseSentenceEffect(parser, s),
      {
        concurrency: "unbounded",
      }
    );

    // Build hypergraph with validation guard
    let hg = HG.make();
    for (const h of edges) {
      if (!h) continue;
      let ok = true;
      // Quick lexical reject of obviously malformed atoms (unknown type or bad connector)
      const text = JSON.stringify(h);
      if (text.includes("/unknown") || text.includes("//")) ok = false;

      // Structural/type checks can throw; sandbox them
      if (ok) {
        try {
          typeOf(h as any);
        } catch (_) {
          ok = false;
        }
      }
      if (ok) {
        try {
          const errs = checkCorrectness(h as any);
          if (errs.length > 0) ok = false;
        } catch (_) {
          ok = false;
        }
      }
      if (!ok) continue;
      hg = HG.insert(hg, h);
    }

    console.log(`Hypergraph size: ${HG.size(hg)} edges`);

    const patterns: ReadonlyArray<readonly [string, ReturnType<typeof hedge>]> =
      [
        [
          "any head with mary/C as 3rd arg",
          hedge([atom("*"), atom("*"), atom("mary/C")] as any),
        ],
        [
          "any head with alice/C as 3rd arg",
          hedge([atom("*"), atom("*"), atom("alice/C")] as any),
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
          "hear/Pd.{os} with 2 args (unordered)",
          hedge([
            atom("+/B/."),
            atom("hear/Pd.{os}"),
            atom("*"),
            atom("*"),
          ] as any),
        ],
      ];

    for (const [label, pat] of patterns) {
      const results = HG.findByPattern(hg, pat);
      const n = Chunk.size(results);
      console.log(`Pattern [${label}]: ${n} matches`);
      let i = 0;
      for (const e of results) {
        if (i++ >= 5) break;
        console.log(prettyPrint(e, { width: 60, indent: 2 }));
      }
    }
    // Stream a subset to demonstrate streaming APIs
    const connStream = HG.streamByConnector(hg, "+/B/.").pipe(
      Stream.map((e) => prettyPrint(e, { width: 60, indent: 2 }))
    );
    const collected = yield* Stream.runCollect(Stream.take(connStream, 5));
    for (const line of collected) {
      yield* Effect.log(line);
    }
    yield* Effect.log(`Total edges (chunk): ${HG.size(hg)}`);
  });

const filePath = process.argv[2] ?? "data/texts/alice.txt";
NodeRuntime.runMain(
  program(filePath).pipe(Effect.provide(NodeFileSystem.layer))
);
