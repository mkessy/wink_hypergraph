# Module Architecture: Effect-Based Hypergraph Knowledge System

## Core Module Structure

```
src/
├── core/
│   ├── hyperedge.ts         # Polymorphic hyperedge foundation
│   ├── encoding.ts          # Type encodings for different edge types
│   ├── hash.ts              # Content-addressing utilities
│   └── proof.ts             # Proof types and operations
│
├── hypergraph/
│   ├── store.ts             # HypergraphStore service (Effect Layer)
│   ├── index.ts             # Graph indexing and traversal
│   ├── merge.ts             # Algebraic merge operations
│   └── slice.ts             # Graph slicing and projection
│
├── ontology/
│   ├── types.ts             # Ontology, TraitCluster, TraitDefinition
│   ├── builder.ts           # Ontology construction from evidence
│   ├── resolver.ts          # Operation reference resolution
│   └── interpreter.ts       # Ontology → API generation
│
├── document/
│   ├── types.ts             # Document representations
│   ├── loader.ts            # Document ingestion (Effect-based)
│   ├── chunker.ts           # Document chunking strategies
│   └── embedder.ts          # Document → Vector embeddings
│
├── operations/
│   ├── types.ts             # Operation<T> interface
│   ├── registry.ts          # Operation registry service
│   ├── llm/
│   │   ├── types.ts         # LLM operation types
│   │   ├── gpt4.ts          # GPT-4 implementation
│   │   ├── claude.ts        # Claude implementation
│   │   └── prompts.ts       # Prompt template management
│   ├── nlp/
│   │   ├── wink.ts          # Wink NLP operations
│   │   └── compromise.ts    # Compromise NLP operations
│   └── statistical/
│       ├── cooccurrence.ts  # Statistical operations
│       └── clustering.ts     # Semantic clustering
│
├── evidence/
│   ├── types.ts             # Evidence types
│   ├── builder.ts           # Evidence construction
│   └── validator.ts         # Evidence validation
│
├── traits/
│   ├── types.ts             # TraitCluster, TraitDefinition
│   ├── merger.ts            # Semantic trait merging
│   ├── splitter.ts          # Trait splitting logic
│   └── embedder.ts          # Trait → Vector embeddings
│
├── entities/
│   ├── types.ts             # Entity types
│   ├── resolver.ts          # Entity resolution/merging
│   └── builder.ts           # Entity construction from traits
│
├── parsing/
│   ├── hypergraph-to-json.ts    # Export hypergraph
│   ├── json-to-hypergraph.ts    # Import hypergraph
│   ├── ontology-serializer.ts   # Ontology persistence
│   └── graphql-api.ts           # GraphQL query generation
│
└── services/
    ├── index.ts             # Service composition
    ├── config.ts            # Configuration management
    └── metrics.ts           # Performance metrics
```

## Core Data Types

### 1. Base Hyperedge Type

```typescript
// core/hyperedge.ts
import { Data, Hash, Effect } from "effect";

// Polymorphic hyperedge - the foundation of everything
export class Hyperedge<T extends HyperedgeEncoding> extends Data.TaggedClass(
  "Hyperedge"
)<{
  readonly id: Hash.Hash;
  readonly encoding: T;
  readonly atoms: T["atoms"];
  readonly proof: Proof;
  readonly deps: ReadonlyArray<Hash.Hash | OperationRef>;
  readonly status: "proven" | "partial" | "pending";
  readonly metadata: HyperedgeMetadata;
}> {
  // Content-addressed ID generation
  static hash<T extends HyperedgeEncoding>(
    encoding: T,
    atoms: T["atoms"]
  ): Hash.Hash {
    return Hash.hash({ encoding, atoms });
  }

  // Check if edge is fully resolved
  get isProven(): boolean {
    return this.status === "proven" && this.proof._tag === "ProofHash";
  }

  // Resolve operation references
  resolve(
    operations: OperationRegistry
  ): Effect.Effect<Hyperedge<T>, ResolutionError, HypergraphStore> {
    return Effect.gen(function* () {
      if (this.isProven) return this;

      // Resolve proof if needed
      const resolvedProof = yield* resolveProof(this.proof, operations);

      // Resolve dependencies
      const resolvedDeps = yield* Effect.forEach(this.deps, (dep) =>
        resolveDep(dep, operations)
      );

      return new Hyperedge({
        ...this,
        proof: resolvedProof,
        deps: resolvedDeps,
        status: "proven",
      });
    });
  }
}

// Proof types
export type Proof =
  | ProofHash // Resolved: points to operation hyperedge
  | OperationRef; // Unresolved: operation to be executed

export class ProofHash extends Data.TaggedClass("ProofHash")<{
  readonly hash: Hash.Hash;
  readonly confidence: number;
}> {}

export class OperationRef extends Data.TaggedClass("OperationRef")<{
  readonly method: string;
  readonly params: unknown;
  readonly expected: HyperedgeEncoding;
}> {}
```

### 2. Hyperedge Encodings

```typescript
// core/encoding.ts
import { Schema as S } from "effect";

// Document encoding
export class DocumentEncoding extends Data.TaggedClass("DocumentEncoding")<{
  readonly atoms: readonly [source: string, content: string, timestamp: bigint];
  readonly proof: "ingestion";
}> {}

// Evidence encoding
export class EvidenceEncoding extends Data.TaggedClass("EvidenceEncoding")<{
  readonly atoms: readonly [claim: string, value: string, confidence: number];
  readonly proof: Hash.Hash | OperationRef;
}> {}

// Trait encoding
export class TraitEncoding extends Data.TaggedClass("TraitEncoding")<{
  readonly atoms: readonly [subject: string, relation: string, object: string];
  readonly proof: ReadonlyArray<Hash.Hash>; // Evidence chain
}> {}

// Entity encoding
export class EntityEncoding extends Data.TaggedClass("EntityEncoding")<{
  readonly atoms: readonly [id: string, ...traits: ReadonlyArray<Hash.Hash>];
  readonly proof: Hash.Hash; // Verification edge
}> {}

// Ontology encoding
export class OntologyEncoding extends Data.TaggedClass("OntologyEncoding")<{
  readonly atoms: readonly [
    domain: string,
    ...patterns: ReadonlyArray<Hash.Hash>
  ];
  readonly proof: ReadonlyArray<Hash.Hash>; // Documents that justified it
}> {}
```

### 3. Hypergraph Store Service

```typescript
// hypergraph/store.ts
import { Context, Effect, Layer, Ref, HashMap } from "effect";

// The main storage service for hyperedges
export class HypergraphStore extends Context.Tag("HypergraphStore")
  HypergraphStore,
  {
    readonly get: (hash: Hash.Hash) => Effect.Effect<Hyperedge<any>, NotFoundError>;
    readonly put: <T extends HyperedgeEncoding>(
      edge: Hyperedge<T>
    ) => Effect.Effect<Hash.Hash>;
    readonly findByPattern: (
      pattern: Pattern
    ) => Effect.Effect<ReadonlySet<Hyperedge<any>>>;
    readonly findByType: <T extends HyperedgeEncoding>(
      encoding: T
    ) => Effect.Effect<ReadonlySet<Hyperedge<T>>>;
    readonly merge: (
      other: HypergraphStore
    ) => Effect.Effect<HypergraphStore, MergeConflict>;
  }
>() {}

// In-memory implementation
export const HypergraphStoreLive = Layer.effect(
  HypergraphStore,
  Effect.gen(function* () {
    const store = yield* Ref.make(HashMap.empty<Hash.Hash, Hyperedge<any>>());
    const indices = yield* Ref.make(new Indices());

    return HypergraphStore.of({
      get: (hash) =>
        Ref.get(store).pipe(
          Effect.map(HashMap.get(hash)),
          Effect.flatMap(Effect.fromOption(() => new NotFoundError(hash)))
        ),

      put: (edge) =>
        Effect.gen(function* () {
          yield* Ref.update(store, HashMap.set(edge.id, edge));
          yield* Ref.update(indices, updateIndices(edge));
          return edge.id;
        }),

      findByPattern: (pattern) =>
        Effect.gen(function* () {
          const idx = yield* Ref.get(indices);
          return idx.findPattern(pattern);
        }),

      // ... other methods
    });
  })
);
```

### 4. Document Types and Operations

```typescript
// document/types.ts
export class Document extends Data.TaggedClass("Document")<{
  readonly id: Hash.Hash;
  readonly source: string;
  readonly content: string;
  readonly chunks: ReadonlyArray<DocumentChunk>;
  readonly metadata: DocumentMetadata;
}> {
  // Convert to hyperedge
  toHyperedge(): Hyperedge<DocumentEncoding> {
    return new Hyperedge({
      id: this.id,
      encoding: new DocumentEncoding(),
      atoms: [this.source, this.content, BigInt(Date.now())],
      proof: "ingestion",
      deps: [],
      status: "proven"
    });
  }
}

// document/loader.ts
export class DocumentLoader extends Context.Tag("DocumentLoader")
  DocumentLoader,
  {
    readonly load: (source: string) => Effect.Effect<Document, LoadError>;
    readonly loadBatch: (
      sources: ReadonlyArray<string>
    ) => Effect.Effect<ReadonlyArray<Document>, LoadError>;
  }
>() {}

// document/chunker.ts
export class DocumentChunker extends Context.Tag("DocumentChunker")
  DocumentChunker,
  {
    readonly chunk: (
      doc: Document,
      strategy: ChunkStrategy
    ) => Effect.Effect<ReadonlyArray<DocumentChunk>>;
  }
>() {}
```

### 5. Operation Types

```typescript
// operations/types.ts
export interface Operation<A> {
  readonly name: string;
  readonly extract: (doc: Document) => Effect.Effect<A, OperationError>;
  readonly toEvidence: (
    result: A,
    doc: Document
  ) => Hyperedge<EvidenceEncoding>;
}

// operations/registry.ts
export class OperationRegistry extends Context.Tag("OperationRegistry")
  OperationRegistry,
  {
    readonly register: (
      name: string,
      operation: Operation<any>
    ) => Effect.Effect<void>;
    readonly get: (name: string) => Effect.Effect<Operation<any>, NotFoundError>;
    readonly resolve: (
      ref: OperationRef
    ) => Effect.Effect<Hyperedge<EvidenceEncoding>, OperationError>;
  }
>() {}
```

### 6. LLM Operations

```typescript
// operations/llm/types.ts
export class LLMService extends Context.Tag("LLMService")
  LLMService,
  {
    readonly extract: (
      prompt: string,
      document: Document
    ) => Effect.Effect<LLMResponse, LLMError>;
    readonly judge: (
      claim1: string,
      claim2: string
    ) => Effect.Effect<SimilarityJudgment, LLMError>;
  }
>() {}

// operations/llm/gpt4.ts
export const GPT4Operations = {
  extractTrait: (traitType: TraitType): Operation<TraitEvidence> => ({
    name: "llm.gpt4.extract_trait",
    extract: (doc) =>
      Effect.gen(function* () {
        const llm = yield* LLMService;
        const prompt = buildTraitPrompt(traitType, doc);
        const response = yield* llm.extract(prompt, doc);
        return parseTraitEvidence(response);
      }),
    toEvidence: (result, doc) =>
      new Hyperedge({
        encoding: new EvidenceEncoding(),
        atoms: [result.claim, result.value, result.confidence],
        proof: new OperationRef({
          method: "llm.gpt4.extract_trait",
          params: { trait: traitType.name },
          expected: new EvidenceEncoding()
        }),
        deps: [doc.id],
        status: "pending"
      })
  })
};
```

### 7. NLP Operations

```typescript
// operations/nlp/wink.ts
import { Context, Effect } from "effect";

export class WinkNLP extends Context.Tag("WinkNLP")
  WinkNLP,
  {
    readonly findPattern: (
      pattern: string,
      text: string
    ) => Effect.Effect<ReadonlyArray<WinkMatch>, WinkError>;
    readonly extractEntities: (
      text: string
    ) => Effect.Effect<ReadonlyArray<Entity>, WinkError>;
  }
>() {}

export const WinkOperations = {
  patternMatch: (pattern: string): Operation<WinkMatch[]> => ({
    name: "nlp.wink.pattern",
    extract: (doc) =>
      Effect.gen(function* () {
        const wink = yield* WinkNLP;
        return yield* wink.findPattern(pattern, doc.content);
      }),
    toEvidence: (matches, doc) =>
      new Hyperedge({
        encoding: new EvidenceEncoding(),
        atoms: [
          `Pattern: ${pattern}`,
          JSON.stringify(matches),
          matches.length > 0 ? 0.8 : 0.0
        ],
        proof: new OperationRef({
          method: "nlp.wink.pattern",
          params: { pattern },
          expected: new EvidenceEncoding()
        }),
        deps: [doc.id],
        status: "pending"
      })
  })
};

// operations/nlp/compromise.ts
export class CompromiseNLP extends Context.Tag("CompromiseNLP")
  CompromiseNLP,
  {
    readonly parse: (text: string) => Effect.Effect<CompromiseDoc>;
    readonly extractTriples: (
      doc: CompromiseDoc
    ) => Effect.Effect<ReadonlyArray<Triple>>;
  }
>() {}
```

### 8. Trait Types with Clustering

```typescript
// traits/types.ts
export class TraitCluster extends Data.TaggedClass("TraitCluster")<{
  readonly canonical: string;
  readonly definitions: HashMap.HashMap<Hash.Hash, TraitDefinition>;
  readonly embeddings: HashMap.HashMap<Hash.Hash, Vector>;
  readonly contexts: HashMap.HashMap<Hash.Hash, DocumentContext>;
  readonly confidence: ConfidenceDistribution;
}> {
  // Add new definition to cluster
  addDefinition(
    def: TraitDefinition,
    evidence: ReadonlyArray<Hyperedge<EvidenceEncoding>>
  ): TraitCluster {
    return new TraitCluster({
      ...this,
      definitions: HashMap.set(this.definitions, def.id, def),
      embeddings: HashMap.set(this.embeddings, def.id, computeEmbedding(def)),
    });
  }

  // Check if another trait should merge with this
  shouldMerge(
    other: TraitCluster
  ): Effect.Effect<MergeDecision, never, LLMService | EmbeddingService> {
    return Effect.gen(function* () {
      // Compute embedding similarity
      const similarity = yield* computeSimilarity(
        this.embeddings,
        other.embeddings
      );

      // LLM semantic judgment
      const llm = yield* LLMService;
      const judgment = yield* llm.judge(this.canonical, other.canonical);

      // Statistical validation
      const stats = yield* validateStatistically(this, other);

      return decideMerge(similarity, judgment, stats);
    });
  }
}
```

### 9. Ontology Types

```typescript
// ontology/types.ts
export class Ontology extends Data.TaggedClass("Ontology")<{
  readonly domain: string;
  readonly traits: HashMap.HashMap<string, TraitCluster>;
  readonly entities: HashMap.HashMap<string, EntityCluster>;
  readonly documents: HashSet.HashSet<Hash.Hash>;
  readonly evidence: HashSet.HashSet<Hash.Hash>;
  readonly status: "template" | "partial" | "proven";
}> {
  // Convert to hyperedge
  toHyperedge(): Hyperedge<OntologyEncoding> {
    const patterns = HashMap.values(this.traits)
      .flatMap((t) => Array.from(t.definitions.values()))
      .map((d) => d.id);

    return new Hyperedge({
      id: Hash.hash(this.domain),
      encoding: new OntologyEncoding(),
      atoms: [this.domain, ...patterns],
      proof: Array.from(this.documents),
      deps: Array.from(this.evidence),
      status: this.status === "proven" ? "proven" : "partial",
    });
  }

  // Parse documents using this ontology
  parse(
    documents: ReadonlyArray<Document>,
    operations: OperationRegistry
  ): Effect.Effect<Ontology, ParseError, HypergraphStore> {
    return Effect.gen(function* () {
      // Extract evidence from each document
      const evidence = yield* Effect.forEach(
        documents,
        (doc) => this.extractEvidence(doc, operations),
        { concurrency: 10 }
      );

      // Build traits from evidence
      const traits = yield* this.buildTraits(evidence.flat());

      // Resolve entities
      const entities = yield* this.resolveEntities(traits);

      return new Ontology({
        ...this,
        traits,
        entities,
        documents: HashSet.union(
          this.documents,
          HashSet.from(documents.map((d) => d.id))
        ),
        evidence: HashSet.union(
          this.evidence,
          HashSet.from(evidence.flat().map((e) => e.id))
        ),
        status: this.checkIfProven() ? "proven" : "partial",
      });
    });
  }
}
```

### 10. Parsing/Serialization

```typescript
// parsing/hypergraph-to-json.ts
export const hypergraphToJSON = (
  graph: Hypergraph
): Effect.Effect<JSON, SerializationError> =>
  Effect.gen(function* () {
    const edges = yield* graph.getAllEdges();

    return {
      version: "1.0",
      edges: edges.map((edge) => ({
        id: edge.id,
        type: edge.encoding._tag,
        atoms: edge.atoms,
        proof: serializeProof(edge.proof),
        deps: edge.deps,
        status: edge.status,
      })),
      metadata: graph.metadata,
    };
  });

// parsing/json-to-hypergraph.ts
export const jsonToHypergraph = (
  json: unknown
): Effect.Effect<Hypergraph, DeserializationError, HypergraphStore> =>
  Effect.gen(function* () {
    const parsed = yield* parseHypergraphJSON(json);
    const store = yield* HypergraphStore;

    // Reconstruct edges
    const edges = yield* Effect.forEach(
      parsed.edges,
      (edge) => reconstructEdge(edge),
      { concurrency: 100 }
    );

    // Add to store
    yield* Effect.forEach(edges, (e) => store.put(e));

    return new Hypergraph({
      store,
      metadata: parsed.metadata,
    });
  });
```

### 11. Service Composition

```typescript
// services/index.ts
import { Layer, Effect } from "effect";

// Compose all services into main runtime
export const MainLayer = Layer.mergeAll(
  HypergraphStoreLive,
  DocumentLoaderLive,
  OperationRegistryLive,
  LLMServiceLive,
  WinkNLPLive,
  CompromiseNLPLive,
  EmbeddingServiceLive
);

// Main program
export const program = Effect.gen(function* () {
  // Load ontology
  const ontology = yield* loadOntology("politics");

  // Load documents
  const docs = yield* DocumentLoader.loadBatch(["news.txt", "wikipedia.txt"]);

  // Parse with operations
  const operations = yield* OperationRegistry;
  const proven = yield* ontology.parse(docs, operations);

  // Query results
  const trump = yield* proven.entities.get("Trump");
  console.log("Trump traits:", trump.traits);

  return proven;
});

// Run with all services
export const main = program.pipe(Effect.provide(MainLayer), Effect.runPromise);
```

## Implementation Path

### Phase 1: Core Foundation

1. Implement polymorphic `Hyperedge<T>` type
2. Build `HypergraphStore` service with Effect
3. Create basic encoding types
4. Implement content-addressing and hashing

### Phase 2: Operations Layer

1. Define `Operation<A>` interface
2. Implement `OperationRegistry` service
3. Add Wink and Compromise NLP operations
4. Create LLM operation stubs

### Phase 3: Document Processing

1. Build document loader and chunker
2. Implement evidence extraction
3. Create trait building from evidence
4. Add proof chain validation

### Phase 4: Ontology System

1. Implement `TraitCluster` with embeddings
2. Build semantic merge operations
3. Create ontology parser
4. Add operation resolution

### Phase 5: Advanced Features

1. Implement cross-ontology comparison
2. Add clustering and splitting logic
3. Build GraphQL API generation
4. Create visualization tools

## Key Effect Patterns

1. **Services as Layers**: All capabilities provided through Effect Context
2. **Suspended Operations**: Operations are Effect computations
3. **Concurrent Processing**: Documents processed in parallel
4. **Error Handling**: Typed errors throughout
5. **Resource Management**: Proper cleanup with Effect.scoped

This architecture ensures the hyperedge remains central while providing clean separation between knowledge representation and computation through Effect's service pattern.
