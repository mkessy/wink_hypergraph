#!/usr/bin/env node

/**
 * Complete Semantic Pipeline: Alpha + Beta Stages
 *
 * This script demonstrates the complete pipeline from text to hypergraph:
 * 1. Alpha Stage: Classify tokens into semantic atoms (C/M/P/T/X/J/B)
 * 2. Beta Stage: Parse atom sequences into nested hypergraph structures
 */

const SemanticAtomClassifier = require("./semantic_atom_classifier");
const {
  HypergraphParser,
  parseClassifiedText,
} = require("./hyper_graph_parser_fixed");

class CompletePipeline {
  constructor() {
    this.classifier = null;
    this.parser = new HypergraphParser();
    this.isReady = false;
  }

  /**
   * Initialize the pipeline with trained models
   */
  async initialize(csvPath = null) {
    console.log("🚀 Initializing Complete Semantic Pipeline...\n");

    // Initialize classifier
    this.classifier = new SemanticAtomClassifier();

    // Try to load pre-trained models
    try {
      this.classifier.loadModels("./models");
      // Sanity check: ensure imported models are usable; else retrain
      try {
        this.classifier.classifyText("Sanity check.");
        console.log("✅ Loaded pre-trained models");
        this.isReady = true;
      } catch (e) {
        console.log(
          "⚠️  Loaded models invalid; retraining...",
          e?.message || e
        );
        throw e;
      }
    } catch (error) {
      console.log("⚠️  No pre-trained models found. Training new models...");

      if (!csvPath) {
        const path = require("path");
        const fs = require("fs");
        const trainPath = path.join(__dirname, "data", "atoms-train.csv");
        const legacyPath = path.join(__dirname, "atoms-en.csv");
        csvPath = fs.existsSync(trainPath) ? trainPath : legacyPath;
      }

      try {
        await this.classifier.loadTrainingData(csvPath);
        this.classifier.train();
        this.classifier.saveModels("./models");
        console.log("✅ Training completed and models saved");
        this.isReady = true;
      } catch (trainError) {
        console.error("❌ Failed to train models:", trainError.message);
        return false;
      }
    }

    return true;
  }

  /**
   * Process text through complete pipeline: Text → Atoms → Hypergraph
   */
  processText(text) {
    if (!this.isReady) {
      throw new Error("Pipeline not initialized. Call initialize() first.");
    }

    console.log(`\n📝 Processing: "${text}"`);
    console.log("=" + "=".repeat(60));

    // Stage 1: Alpha - Classify atoms
    console.log("\n🔍 Alpha Stage - Token Classification:");
    console.log("-".repeat(40));

    const classificationResults = this.classifier.classifyText(text);

    // Stage 2: Beta - Build hypergraph
    console.log("\n🏗️  Beta Stage - Hypergraph Construction:");
    console.log("-".repeat(40));

    this.parser.setDebug(true);
    const hypergraph = parseClassifiedText(classificationResults);

    console.log("\n📊 Final Result:");
    console.log("-".repeat(20));
    if (hypergraph) {
      console.log("Hypergraph:", hypergraph.toString());
      this.analyzeHypergraph(hypergraph);
    } else {
      console.log("No hypergraph generated (single atom or parsing failed)");
    }

    return {
      text: text,
      atoms: classificationResults,
      hypergraph: hypergraph,
      hypergraphString: hypergraph ? hypergraph.toString() : null,
    };
  }

  /**
   * Analyze and explain the resulting hypergraph structure
   */
  analyzeHypergraph(hypergraph) {
    console.log("\n🔬 Hypergraph Analysis:");
    console.log("-".repeat(25));

    if (hypergraph.isAtom) {
      console.log("Type: Atomic hyperedge");
      console.log("Atom:", hypergraph.toString());
    } else {
      console.log("Type: Non-atomic hyperedge");
      console.log("Connector:", hypergraph.connector() || "None");
      console.log("Arguments:", hypergraph.args().length);
      console.log("Structure depth:", this.calculateDepth(hypergraph));
      console.log("Total atoms:", this.countAtoms(hypergraph));

      // Analyze semantic structure
      this.explainSemantics(hypergraph);
    }
  }

  /**
   * Calculate the depth of nested hypergraph structure
   */
  calculateDepth(hypergraph, currentDepth = 0) {
    if (hypergraph.isAtom) {
      return currentDepth;
    }

    let maxDepth = currentDepth;
    for (const element of hypergraph.elements) {
      if (element && element.calculateDepth) {
        const depth = element.calculateDepth(element, currentDepth + 1);
        maxDepth = Math.max(maxDepth, depth);
      }
    }

    return maxDepth;
  }

  /**
   * Count total atomic elements in hypergraph
   */
  countAtoms(hypergraph) {
    if (hypergraph.isAtom) {
      return 1;
    }

    let count = 0;
    for (const element of hypergraph.elements) {
      if (typeof element === "string") {
        count += 1;
      } else if (element && element.elements) {
        count += this.countAtoms(element);
      }
    }

    return count;
  }

  /**
   * Explain semantic structure in human terms
   */
  explainSemantics(hypergraph) {
    console.log("\n💡 Semantic Interpretation:");
    console.log("-".repeat(30));

    if (hypergraph.isAtom) {
      console.log(`Single concept: ${hypergraph.toString()}`);
      return;
    }

    const connector = hypergraph.connector();
    if (!connector) {
      console.log("Unstructured hypergraph");
      return;
    }

    const connectorType = connector.charAt(0);
    const args = hypergraph.args();

    switch (connectorType) {
      case "P":
        console.log(
          `Predicate structure: "${connector}" with ${args.length} arguments`
        );
        if (args.length >= 1) console.log(`  Subject: ${args[0]}`);
        if (args.length >= 2) console.log(`  Object: ${args[1]}`);
        if (args.length >= 3)
          console.log(`  Additional: ${args.slice(2).join(", ")}`);
        break;

      case "C":
        console.log(`Complex concept: modified or compound noun phrase`);
        console.log(`  Components: ${args.join(", ")}`);
        break;

      case "M":
        console.log(`Modified structure: attribute applied to concept`);
        console.log(`  Modifier: ${connector}`);
        console.log(`  Target: ${args[0]}`);
        break;

      case "T":
        console.log(
          `Triggered specification: temporal/spatial/causal relation`
        );
        console.log(`  Trigger: ${connector}`);
        console.log(`  Specification: ${args.join(", ")}`);
        break;

      case "B":
        console.log(`Built concept: possessive or compound structure`);
        console.log(`  Builder: ${connector}`);
        console.log(`  Components: ${args.join(", ")}`);
        break;

      case "J":
        console.log(`Junction: coordinated structure`);
        console.log(`  Coordinator: ${connector}`);
        console.log(`  Coordinated elements: ${args.join(", ")}`);
        break;

      default:
        console.log(`Generic structure with connector: ${connector}`);
        console.log(`  Arguments: ${args.join(", ")}`);
    }
  }

  /**
   * Batch process multiple texts
   */
  processBatch(texts) {
    const results = [];

    console.log(`\n📦 Batch Processing ${texts.length} texts...\n`);

    texts.forEach((text, index) => {
      console.log(`\n[${index + 1}/${texts.length}] Processing: "${text}"`);
      try {
        const result = this.processText(text);
        results.push(result);
      } catch (error) {
        console.error(`Error processing text ${index + 1}:`, error.message);
        results.push({ text, error: error.message });
      }
    });

    return results;
  }

  /**
   * Generate semantic similarity report between texts
   */
  compareTexts(text1, text2) {
    const result1 = this.processText(text1);
    const result2 = this.processText(text2);

    console.log("\n🔄 Semantic Comparison:");
    console.log("-".repeat(25));

    // Simple structural comparison
    const similarity = this.calculateSimilarity(
      result1.hypergraph,
      result2.hypergraph
    );
    console.log(`Structural similarity: ${(similarity * 100).toFixed(1)}%`);

    return { result1, result2, similarity };
  }

  /**
   * Calculate basic structural similarity between hypergraphs
   */
  calculateSimilarity(hg1, hg2) {
    if (!hg1 || !hg2) return 0;

    const str1 = hg1.toString().toLowerCase();
    const str2 = hg2.toString().toLowerCase();

    // Simple Jaccard similarity on character level
    const set1 = new Set(str1.split(""));
    const set2 = new Set(str2.split(""));

    const intersection = new Set([...set1].filter((x) => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  }
}

// Main demonstration function
async function main() {
  const pipeline = new CompletePipeline();

  // Initialize pipeline
  const initialized = await pipeline.initialize();
  if (!initialized) {
    console.error("Failed to initialize pipeline");
    process.exit(1);
  }

  // Test sentences of increasing complexity
  const testSentences = [
    "John loves Mary.",
    "Einstein first published the theory of relativity in 1905.",
    "The quick brown fox jumps.",
    "Alice and Bob went to the store.",
    "The brilliant scientist discovered a new planet.",
    "Dr. Smith works at Harvard University in Boston.",
    "The old man gave his grandson a beautiful book.",
  ];

  console.log("\n🧪 Complete Semantic Pipeline Demonstration");
  console.log("=" + "=".repeat(50));

  // Process each sentence
  const results = [];
  for (const sentence of testSentences) {
    try {
      const result = pipeline.processText(sentence);
      results.push(result);
    } catch (error) {
      console.error(`Error processing "${sentence}":`, error.message);
    }
  }

  // Summary report
  console.log("\n📈 Pipeline Summary Report");
  console.log("=" + "=".repeat(30));
  console.log(`Processed: ${results.length} sentences`);
  console.log(
    `Successful hypergraphs: ${results.filter((r) => r.hypergraph).length}`
  );
  console.log(
    `Average atoms per sentence: ${(
      results.reduce((sum, r) => sum + (r.atoms?.length || 0), 0) /
      results.length
    ).toFixed(1)}`
  );

  console.log("\n✅ Pipeline demonstration complete!");
}

// Export for use as module
module.exports = CompletePipeline;

// Run main if executed directly
if (require.main === module) {
  main().catch(console.error);
}
