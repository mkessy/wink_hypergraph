# Production Semantic Hypergraph Parser

A production-ready semantic hypergraph parser that transforms natural language text into GraphBrain-compatible semantic hypergraphs with comprehensive entity preprocessing and semantic intelligence.

## 🚀 Features

- **89.46% Classification Accuracy** - Trained on GraphBrain's atom dataset
- **Entity Preprocessing** - Compound entities like "New York" treated as single atoms
- **BM25 Semantic Enhancement** - Semantic similarity scoring for coherent parsing
- **Punctuation Integration** - Proper handling of sentence boundaries and structure
- **Production-Ready API** - Clean, typed interfaces with comprehensive output
- **Comprehensive Metrics** - Detailed parsing statistics and performance data

## 📦 Installation

```bash
npm install
```

Required models directory with pre-trained classifiers:

- `models/bayes_model.json`
- `models/compromise_model.json`
- `models/encodings.json`

## 🔧 Quick Start

```javascript
const {
  ProductionHypergraphParser,
} = require("./production_hypergraph_parser.cjs");

async function example() {
  const parser = new ProductionHypergraphParser({
    enableBM25: true,
    enableEntityPreprocessing: true,
    enablePunctuationHandling: true,
    bm25: {
      // optionally inject a pre-trained wink BM25 instance
      // vectorizer: BM25Vectorizer({ k1: 1.2, b: 0.75, k: 1, norm: 'l2' }),
      cacheVectors: true,
    },
    entityPreprocessing: {
      // conservative auto-detect by default
      autoDetect: true,
      // optional user-provided phrases → treated as compounds
      compoundList: ["New York"],
      // optional typed map of phrases
      compoundMap: { "Harvard University": "organization" },
      maxCompoundWords: 4,
      minFrequency: 2,
    },
  });

  await parser.initialize();

  const result = await parser.parse("Dr. Smith works at Harvard University!");

  console.log("Hypergraph:", result.hypergraphString);
  console.log("Entities:", result.entities);
  console.log("Metrics:", result.metrics);
}
```

### BM25 injection and caching

You can inject an external wink `BM25Vectorizer` and enable/disable per-parse token vector caching:

```js
const bm25 = require("wink-nlp/utilities/bm25-vectorizer")({
  k1: 1.2,
  b: 0.75,
  k: 1,
  norm: "l2",
});
const parser = new ProductionHypergraphParser({
  enableBM25: true,
  bm25: { vectorizer: bm25, cacheVectors: true },
});
```

## 📊 Output Format

The parser returns a comprehensive `ParsingResult` object:

```typescript
interface ParsingResult {
  originalText: string; // Input text
  preprocessedText: string; // Normalized text
  atoms: AtomClassification[]; // Individual atom classifications
  entities: DetectedEntity[]; // Compound entities found
  hypergraph: HypergraphEdge; // Parsed structure
  hypergraphString: string; // String representation
  metrics: ParsingMetrics; // Performance data
  metadata: object; // Parser info
}
```

### Example Output

```javascript
{
  originalText: "Dr. Smith works at Harvard University!",
  preprocessedText: "Dr. Smith works at Harvard University!",
  atoms: [
    {
      token: "dr._smith",
      prediction: "C",
      confidence: 0.95,
      isCompound: true,
      originalTokens: ["Dr.", "Smith"],
      enhancements: ["Compound entity: Dr. Smith"]
    },
    // ... more atoms
  ],
  entities: [
    {
      text: "Dr. Smith",
      compound: "dr._smith",
      type: "person",
      words: ["Dr.", "Smith"],
      startPosition: 0,
      endPosition: 9
    },
    {
      text: "Harvard University",
      compound: "harvard_university",
      type: "organization",
      words: ["Harvard", "University"],
      startPosition: 20,
      endPosition: 38
    }
  ],
  hypergraph: {
    type: "hyperedge",
    elements: [
      "and/J",
      {
        type: "hyperedge",
        elements: [
          "works/Pd.so",
          "dr._smith/Cp",
          "harvard_university/Cp"
        ]
      },
      "!"
    ]
  },
  hypergraphString: "(and/J (works/Pd.so dr._smith/Cp harvard_university/Cp) !)",
  metrics: {
    totalTokens: 8,
    compoundEntities: 2,
    averageConfidence: 0.89,
    processingTimeMs: 15
  },
  metadata: {
    parserVersion: "1.0.0",
    timestamp: "2024-01-15T10:30:00.000Z"
  }
}
```

## 🔬 Key Improvements

### Entity Preprocessing

**Before:**

```text
Input: "New York is a major city"
Output: (york/C new/M) // "New" incorrectly modifies "York"
```

**After:**

```text
Input: "New York is a major city"
Output: new_york/Cp // Single semantic unit preserved
```

### Semantic Intelligence

- **BM25 Vectorization**: Semantic similarity scoring
- **Context Awareness**: Document-level relevance scoring
- **Entity Relationships**: Automatic relationship detection

### Production Features

- **Typed Interfaces**: Full TypeScript-style documentation
- **Error Handling**: Comprehensive error management
- **Performance Metrics**: Detailed timing and statistics
- **Configurable Options**: Flexible feature toggles

## ⚙️ Configuration Options

```javascript
const parser = new ProductionHypergraphParser({
  debug: false, // Enable debug logging
  enableBM25: true, // Semantic similarity scoring
  enableEntityPreprocessing: true, // Compound entity detection
  enablePunctuationHandling: true, // Punctuation integration
  maxIterations: 50, // Max parsing iterations
});
```

## 📈 Performance

- **Classification Accuracy**: 89.46% on GraphBrain test set
- **Processing Speed**: ~15ms average for typical sentences
- **Memory Efficient**: Optimized model loading and caching
- **Scalable**: Production-ready architecture

## 🏗️ Architecture

```text
Text Input
    ↓
┌─────────────────────────┐
│ Entity Preprocessing    │
│ • Compromise.js NER     │
│ • Compound detection    │
│ • Multi-word entities   │
└─────────────────────────┘
    ↓
┌─────────────────────────┐
│ Semantic Classification │
│ • 89.46% accuracy       │
│ • BM25 context boost    │
│ • Ensemble methods      │
└─────────────────────────┘
    ↓
┌─────────────────────────┐
│ Hypergraph Construction │
│ • Global rule selection │
│ • Semantic coherence    │
│ • Punctuation handling  │
└─────────────────────────┘
    ↓
Typed Production Output
```

## 📚 API Reference

### `ProductionHypergraphParser`

#### Constructor

```javascript
new ProductionHypergraphParser(options?)
```

#### Methods

- `initialize()` - Initialize parser with models
- `parse(text)` - Parse text into hypergraph
- `getInfo()` - Get parser information

#### Options

| Option                                 | Type                  | Default | Description                                  |
| -------------------------------------- | --------------------- | ------- | -------------------------------------------- |
| `enableBM25`                           | boolean               | true    | Enable semantic similarity                   |
| `enableEntityPreprocessing`            | boolean               | true    | Enable compound entities                     |
| `enablePunctuationHandling`            | boolean               | true    | Handle punctuation                           |
| `maxIterations`                        | number                | 50      | Max parsing iterations                       |
| `bm25.vectorizer`                      | object                | null    | Inject external wink BM25 instance           |
| `bm25.cacheVectors`                    | boolean               | true    | Cache BM25 token vectors during parse        |
| `entityPreprocessing.autoDetect`       | boolean               | false   | Use Compromise to detect multi-word entities |
| `entityPreprocessing.compoundList`     | string[]              | []      | Force specific phrases to be compounds       |
| `entityPreprocessing.compoundMap`      | Record<string,string> | {}      | Force phrases with types                     |
| `entityPreprocessing.maxCompoundWords` | number                | 4       | Upper bound on compound length               |
| `entityPreprocessing.minFrequency`     | number                | 2       | Min occurrences for non-NE compounds         |
| `debug`                                | boolean               | false   | Enable debug output                          |

## 🧪 Testing

Run the production parser demo:

```bash
node production_hypergraph_parser.cjs
```

Compare with other implementations:

```bash
node final_validation_test.js
```

## 📄 License

MIT License - See LICENSE file for details.

## 🤝 Contributing

This is a research implementation based on GraphBrain's semantic hypergraph notation. For production use, ensure proper model training and validation for your specific domain.

---

**Built with**: Node.js, Wink NLP, Compromise.js, BM25 Vectorization
