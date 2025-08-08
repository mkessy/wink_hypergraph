#!/usr/bin/env node

/**
 * BM25-Enhanced Parser Comparison Test
 *
 * Compare BM25-enhanced parser against the previous implementation
 */

const { BM25EnhancedParser } = require("./bm25_enhanced_parser");
const {
  EnhancedCompromiseParserV2,
} = require("./enhanced_compromise_parser_v2");

async function compareImplementations() {
  console.log("🔬 BM25 vs Enhanced Compromise Parser Comparison");
  console.log("=".repeat(60));

  // Initialize both parsers
  const bm25Parser = new BM25EnhancedParser();
  const compromiseParser = new EnhancedCompromiseParserV2();

  const bm25Initialized = await bm25Parser.initialize();
  const compromiseInitialized = await compromiseParser.initialize();

  if (!bm25Initialized || !compromiseInitialized) {
    console.log("❌ Could not initialize one or both parsers");
    return;
  }

  console.log("✅ Both parsers initialized successfully\n");

  // Test sentences
  const testSentences = [
    "The old man gave his grandson a beautiful book.",
    "Dr. Smith works at Harvard University.",
    "Alice and Bob visited New York.",
    "Scientists discovered new species.",
    "Obama warns Putin against strikes in Syria.",
  ];

  for (const sentence of testSentences) {
    console.log(`\n📝 Testing: "${sentence}"`);
    console.log("-".repeat(80));

    // Parse with both implementations
    console.log("\n🔵 BM25-Enhanced Parser:");
    bm25Parser.setDebug(false); // Less verbose for comparison
    const bm25Result = bm25Parser.parse(sentence);
    console.log(`   ${bm25Parser.hyperedgeToString(bm25Result)}`);

    console.log("\n🟢 Enhanced Compromise Parser:");
    compromiseParser.setDebug(false);
    const compromiseResult = compromiseParser.processText(sentence);
    const compromiseHypergraph =
      compromiseResult.hypergraph || "No hypergraph generated";
    console.log(`   ${compromiseHypergraph}`);

    console.log("\n📊 Analysis:");
    const bm25String = bm25Parser.hyperedgeToString(bm25Result);
    console.log(`   BM25 Length: ${bm25String.length} chars`);
    console.log(`   Compromise Length: ${compromiseHypergraph.length} chars`);

    // Count nesting levels
    const bm25Nesting = countNesting(bm25String);
    const compromiseNesting = countNesting(compromiseHypergraph);
    console.log(`   BM25 Max Nesting: ${bm25Nesting}`);
    console.log(`   Compromise Max Nesting: ${compromiseNesting}`);

    console.log("\n" + "═".repeat(80));
  }

  console.log("\n🎯 Summary:");
  console.log("BM25-Enhanced Features:");
  console.log("  ✅ Semantic similarity scoring");
  console.log("  ✅ Entity relationship detection");
  console.log("  ✅ Context-aware classification");
  console.log("  ✅ BM25 vectorization for coherence");

  console.log("\nEnhanced Compromise Features:");
  console.log("  ✅ Advanced POS correction");
  console.log("  ✅ Named entity recognition");
  console.log("  ✅ Syntactic relationship analysis");
  console.log("  ✅ Rule-based parsing improvements");
}

function countNesting(hypergraph) {
  if (!hypergraph || typeof hypergraph !== "string") {
    return 0;
  }

  let maxNesting = 0;
  let currentNesting = 0;

  for (const char of hypergraph) {
    if (char === "(") {
      currentNesting++;
      maxNesting = Math.max(maxNesting, currentNesting);
    } else if (char === ")") {
      currentNesting--;
    }
  }

  return maxNesting;
}

if (require.main === module) {
  compareImplementations().catch(console.error);
}
