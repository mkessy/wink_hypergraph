#!/usr/bin/env node

/**
 * Test script for hypergraph parser debugging
 */

const { HypergraphParser } = require('./hyper_graph_parser_fixed');

// Test with a simple example
const parser = new HypergraphParser();
parser.setDebug(true);

console.log("Testing simple modifier + noun combination:");
console.log("==========================================\n");

// Test 1: Just "old man"
const test1 = [
  { token: "old", type: "M", features: { pos: "ADJ", is_adjective: true } },
  { token: "man", type: "C", features: { pos: "NOUN" } }
];

console.log("Test 1: 'old man'");
const result1 = parser.parse(test1);
console.log(`Result: ${result1.toString()}`);
console.log(`Expected: (man/Cc old/Ma)\n`);

// Test 2: "the old man"
const test2 = [
  { token: "the", type: "M", features: { pos: "DET", is_determiner: true } },
  { token: "old", type: "M", features: { pos: "ADJ", is_adjective: true } },
  { token: "man", type: "C", features: { pos: "NOUN" } }
];

console.log("\nTest 2: 'the old man'");
const result2 = parser.parse(test2);
console.log(`Result: ${result2.toString()}`);
console.log(`Expected: (the/Md (man/Cc old/Ma))\n`);

// Let's trace through what should happen step by step
console.log("\n\nManual trace of what SHOULD happen:");
console.log("===================================");
console.log("Initial: [the/Md, old/Ma, man/Cc]");
console.log("Step 1: Apply M(2) to [old/Ma, man/Cc] -> (man/Cc old/Ma)");
console.log("After Step 1: [the/Md, (man/Cc old/Ma)]");
console.log("Step 2: Apply M(2) to [the/Md, (man/Cc old/Ma)] -> ((man/Cc old/Ma) the/Md)");
console.log("Final: ((man/Cc old/Ma) the/Md)");