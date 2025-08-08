#!/usr/bin/env node

/**
 * JavaScript Hypergraph Parser - Beta Stage Implementation
 *
 * This module takes classified atoms from the Alpha stage and constructs
 * semantic hypergraphs using Graphbrain's grammar rules and parsing logic.
 */

class Hyperedge {
  constructor(elements) {
    if (typeof elements === "string") {
      // Atomic hyperedge
      this.elements = [elements];
      this.isAtom = true;
    } else {
      // Non-atomic hyperedge
      this.elements = elements || [];
      this.isAtom = false;
    }
  }

  /**
   * Get the connector (first element) of a hyperedge
   */
  connector() {
    return this.isAtom ? null : this.elements[0];
  }

  /**
   * Get arguments (all elements except connector)
   */
  args() {
    return this.isAtom ? [] : this.elements.slice(1);
  }

  /**
   * Get atom type (first character of atom string)
   */
  atomType() {
    if (this.isAtom) {
      return this.elements[0].charAt(0);
    }
    return null;
  }

  /**
   * String representation
   */
  toString() {
    if (this.isAtom) {
      return this.elements[0];
    } else {
      return (
        "(" +
        this.elements
          .map((e) => (e instanceof Hyperedge ? e.toString() : e))
          .join(" ") +
        ")"
      );
    }
  }

  /**
   * Create hyperedge from array notation
   */
  static from(elements) {
    if (typeof elements === "string") {
      return new Hyperedge(elements);
    }
    return new Hyperedge(
      elements.map((e) => (typeof e === "string" ? e : Hyperedge.from(e)))
    );
  }
}

class GrammarRule {
  constructor(targetType, allowedTypes, arity, connector = null) {
    this.targetType = targetType; // Result atom type (C/M/P/T/B/J/R/S)
    this.allowedTypes = new Set(allowedTypes); // Types this rule can combine
    this.arity = arity; // Number of elements in rule window
    this.connector = connector; // Optional connector pattern
    this.priority = 0; // Rule priority for conflict resolution
  }

  /**
   * Check if this rule can apply at given position in sequence
   */
  canApply(atoms, position) {
    // Check window size
    if (position + this.arity > atoms.length) {
      return false;
    }

    // Check if all atoms in window match allowed types
    for (let i = 0; i < this.arity; i++) {
      const atom = atoms[position + i];
      const atomType = this.getAtomType(atom);
      if (!this.allowedTypes.has(atomType)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get atom type from atom object or hyperedge
   */
  getAtomType(atom) {
    if (typeof atom === "string") {
      return atom.charAt(0);
    }
    if (atom instanceof Hyperedge) {
      return atom.isAtom ? atom.atomType() : atom.connector()?.charAt(0);
    }
    return atom.type || "C"; // fallback
  }

  /**
   * Apply rule at given position, return new hyperedge
   */
  apply(atoms, position, scores = null) {
    if (!this.canApply(atoms, position)) {
      return null;
    }

    const window = atoms.slice(position, position + this.arity);

    // Create hyperedge based on rule type
    switch (this.targetType) {
      case "C":
        return this.buildConcept(window);
      case "M":
        return this.buildModifier(window);
      case "P":
        return this.buildPredicate(window);
      case "T":
        return this.buildTrigger(window);
      case "B":
        return this.buildBuilder(window);
      case "J":
        return this.buildJunction(window);
      case "R":
        return this.buildRelation(window);
      case "S":
        return this.buildSpecifier(window);
      default:
        return this.buildGeneric(window);
    }
  }

  /**
   * Build concept hyperedge (noun phrases, etc.)
   */
  buildConcept(elements) {
    if (elements.length === 2) {
      // Simple noun phrase: determiner + noun, adjective + noun, etc.
      return new Hyperedge(elements);
    }
    return new Hyperedge(elements);
  }

  /**
   * Build modifier hyperedge
   */
  buildModifier(elements) {
    // Modifier applies to following element
    const [modifier, target] = elements;
    return new Hyperedge([modifier, target]);
  }

  /**
   * Build predicate hyperedge (verb phrases, clauses)
   */
  buildPredicate(elements) {
    // Predicate with arguments: verb + subject/object/etc
    const [predicate, ...args] = elements;
    return new Hyperedge([predicate, ...args]);
  }

  /**
   * Build trigger hyperedge (temporal/spatial specifications)
   */
  buildTrigger(elements) {
    const [trigger, target] = elements;
    return new Hyperedge([trigger, target]);
  }

  /**
   * Build builder hyperedge (possessives, compounds)
   */
  buildBuilder(elements) {
    if (elements.length === 3) {
      const [left, builder, right] = elements;
      return new Hyperedge([builder, left, right]);
    }
    return new Hyperedge(elements);
  }

  /**
   * Build junction hyperedge (conjunctions)
   */
  buildJunction(elements) {
    const [left, junction, right] = elements;
    return new Hyperedge([junction, left, right]);
  }

  /**
   * Build relation hyperedge
   */
  buildRelation(elements) {
    return new Hyperedge(elements);
  }

  /**
   * Build specifier hyperedge
   */
  buildSpecifier(elements) {
    return new Hyperedge(elements);
  }

  /**
   * Generic hyperedge builder
   */
  buildGeneric(elements) {
    return new Hyperedge(elements);
  }
}

class HypergraphParser {
  constructor() {
    this.rules = this.initializeGrammarRules();
    this.debug = false;
  }

  /**
   * Initialize Graphbrain's grammar rules
   */
  initializeGrammarRules() {
    const rules = [
      // Strict rules from Graphbrain (order matters for priority)
      new GrammarRule("C", ["C"], 2, "+/B/."), // Concept + Concept -> Builder
      new GrammarRule("M", ["C", "R", "M", "S", "T", "P", "B", "J"], 2), // Modifier application
      new GrammarRule("B", ["C"], 3), // Builder with Concept
      new GrammarRule("T", ["C", "R"], 2), // Trigger with Concept/Relation
      new GrammarRule("P", ["C", "R", "S"], 6), // Predicate rules (multiple arities)
      new GrammarRule("P", ["C", "R", "S"], 5),
      new GrammarRule("P", ["C", "R", "S"], 4),
      new GrammarRule("P", ["C", "R", "S"], 3),
      new GrammarRule("P", ["C", "R", "S"], 2),
      new GrammarRule("J", ["C", "R", "M", "S", "T", "P", "B", "J"], 3), // Junction rule

      // Additional repair rules
      new GrammarRule("C", ["M", "C"], 2), // Modifier + Concept
      new GrammarRule("P", ["M", "P"], 2), // Modifier + Predicate
      new GrammarRule("T", ["T", "C"], 2), // Trigger + Concept
      new GrammarRule("B", ["C", "B", "C"], 3), // Concept + Builder + Concept
    ];

    // Set priorities (lower index = higher priority)
    rules.forEach((rule, index) => {
      rule.priority = index;
    });

    return rules;
  }

  /**
   * Parse sequence of classified atoms into hypergraph
   */
  parse(atomSequence) {
    if (!atomSequence || atomSequence.length === 0) {
      return null;
    }

    // Convert atom objects to proper format
    let sequence = this.normalizeAtomSequence(atomSequence);

    if (this.debug) {
      console.log(
        "Input sequence:",
        sequence.map((a) => this.atomToString(a))
      );
    }

    // Iterative bottom-up parsing
    let iteration = 0;
    const maxIterations = sequence.length * 2; // Prevent infinite loops

    while (sequence.length > 1 && iteration < maxIterations) {
      const originalLength = sequence.length;
      sequence = this.parseIteration(sequence);

      if (this.debug) {
        console.log(
          `Iteration ${iteration + 1}:`,
          sequence.map((a) => this.atomToString(a))
        );
      }

      // If no progress made, break
      if (sequence.length === originalLength) {
        if (this.debug) {
          console.log("No more rules applicable, stopping");
        }
        break;
      }

      iteration++;
    }

    // Return final result
    if (sequence.length === 1) {
      return sequence[0];
    } else {
      // Multiple disconnected components - create junction
      return new Hyperedge(["and/J", ...sequence]);
    }
  }

  /**
   * Single iteration of parsing
   */
  parseIteration(sequence) {
    const newSequence = [];
    let i = 0;

    while (i < sequence.length) {
      let bestRule = null;
      let bestScore = -1;
      let bestPosition = i;

      // Try all rules at current position
      for (const rule of this.rules) {
        if (rule.canApply(sequence, i)) {
          const score = this.scoreRule(rule, sequence, i);
          if (score > bestScore) {
            bestRule = rule;
            bestScore = score;
            bestPosition = i;
          }
        }
      }

      if (bestRule) {
        // Apply best rule
        const hyperedge = bestRule.apply(sequence, bestPosition);
        if (hyperedge) {
          newSequence.push(hyperedge);
          i += bestRule.arity; // Skip processed elements

          if (this.debug) {
            console.log(
              `Applied rule ${bestRule.targetType}(${
                bestRule.arity
              }) at position ${bestPosition}: ${hyperedge.toString()}`
            );
          }
          continue;
        }
      }

      // No rule applied, keep original atom
      newSequence.push(sequence[i]);
      i++;
    }

    return newSequence;
  }

  /**
   * Score a rule application (higher = better)
   */
  scoreRule(rule, sequence, position) {
    let score = 100; // Base score

    // Higher priority rules get higher scores
    score -= rule.priority;

    // Prefer rules that combine more elements
    score += rule.arity * 10;

    // Prefer rules that process predicates (sentence heads)
    if (rule.targetType === "P") {
      score += 20;
    }

    // Prefer rules that process main concepts
    if (rule.targetType === "C") {
      score += 10;
    }

    // Bonus for combining adjacent elements
    if (rule.arity === 2 && position < sequence.length - 1) {
      score += 5;
    }

    return score;
  }

  /**
   * Normalize atom sequence from classifier output
   */
  normalizeAtomSequence(atomSequence) {
    return atomSequence.map((atom) => {
      if (typeof atom === "string") {
        return atom;
      }

      if (atom.prediction && atom.features) {
        // From our classifier output
        const token = atom.features.token;
        const type = atom.prediction;
        const subtype = this.inferSubtype(token, type, atom.features);
        return `${token}/${type}${subtype}`;
      }

      if (atom.token && atom.type) {
        // Simple token object
        const subtype = this.inferSubtype(atom.token, atom.type);
        return `${atom.token}/${atom.type}${subtype}`;
      }

      return atom.toString();
    });
  }

  /**
   * Infer subtype based on token properties
   */
  inferSubtype(token, type, features = {}) {
    switch (type) {
      case "C":
        // Concept subtypes
        if (features.is_person || /^[A-Z][a-z]+$/.test(token)) {
          return "p"; // Proper noun
        }
        if (features.pos === "PROPN" || /^[A-Z]/.test(token)) {
          return "p"; // Proper noun
        }
        if (features.pos === "ADJ" || features.is_adjective) {
          return "a"; // Adjective concept
        }
        if (features.pos === "PRON" || features.is_pronoun) {
          return "i"; // Pronoun
        }
        return "c"; // Common concept

      case "M":
        // Modifier subtypes
        if (features.pos === "ADV" || features.is_adverb) {
          return "a"; // Adverb
        }
        if (features.pos === "DET" || features.is_determiner) {
          return "d"; // Determiner
        }
        return ""; // Generic modifier

      case "P":
        // Predicate subtypes
        return "d.so"; // Declarative with subject-object roles

      case "X":
        // Punctuation subtypes
        return "";

      default:
        return "";
    }
  }

  /**
   * Convert atom to string representation
   */
  atomToString(atom) {
    if (typeof atom === "string") {
      return atom;
    }
    if (atom instanceof Hyperedge) {
      return atom.toString();
    }
    return atom.toString();
  }

  /**
   * Enable/disable debug output
   */
  setDebug(enabled) {
    this.debug = enabled;
  }
}

// Example usage and testing
function demonstrateParser() {
  const parser = new HypergraphParser();
  parser.setDebug(true);

  console.log("🧠 Hypergraph Parser Demonstration");
  console.log("==================================\n");

  // Test cases from different complexity levels
  const testCases = [
    {
      description: "Simple sentence: 'John loves Mary'",
      atoms: [
        { token: "John", type: "C", pos: "PROPN" },
        { token: "loves", type: "P", pos: "VERB" },
        { token: "Mary", type: "C", pos: "PROPN" },
      ],
    },
    {
      description: "Modified sentence: 'The quick fox jumps'",
      atoms: [
        { token: "The", type: "M", pos: "DET" },
        { token: "quick", type: "M", pos: "ADJ" },
        { token: "fox", type: "C", pos: "NOUN" },
        { token: "jumps", type: "P", pos: "VERB" },
      ],
    },
    {
      description: "Complex sentence: 'Alice and Bob went to the store'",
      atoms: [
        { token: "Alice", type: "C", pos: "PROPN" },
        { token: "and", type: "J", pos: "CONJ" },
        { token: "Bob", type: "C", pos: "PROPN" },
        { token: "went", type: "P", pos: "VERB" },
        { token: "to", type: "T", pos: "ADP" },
        { token: "the", type: "M", pos: "DET" },
        { token: "store", type: "C", pos: "NOUN" },
      ],
    },
  ];

  testCases.forEach((testCase, index) => {
    console.log(`\n${index + 1}. ${testCase.description}`);
    console.log("-".repeat(50));

    const result = parser.parse(testCase.atoms);

    console.log("Result:", result ? result.toString() : "null");
    console.log("");
  });
}

// Integration function for use with classifiers
function parseClassifiedText(classifierResults) {
  const parser = new HypergraphParser();

  // Filter out punctuation (X type) for cleaner hypergraphs
  const meaningfulAtoms = classifierResults.filter(
    (result) => result.prediction !== "X"
  );

  return parser.parse(meaningfulAtoms);
}

// Export for use as module
module.exports = {
  HypergraphParser,
  Hyperedge,
  GrammarRule,
  parseClassifiedText,
  demonstrateParser,
};

// Run demonstration if executed directly
if (require.main === module) {
  demonstrateParser();
}
