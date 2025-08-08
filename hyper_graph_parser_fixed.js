#!/usr/bin/env node

/**
 * JavaScript Hypergraph Parser - Fixed Implementation
 *
 * This module takes classified atoms from the Alpha stage and constructs
 * semantic hypergraphs using Graphbrain's grammar rules and parsing logic.
 * 
 * FIXES IMPLEMENTED:
 * 1. Correct rule definitions and priorities
 * 2. Pivot-based rule application (tries each position as connector)
 * 3. Global best-rule selection instead of sequential
 * 4. Sophisticated scoring system
 * 5. Proper nested structure builders
 * 6. Enhanced atom normalization
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
    return this.isAtom ? this.elements[0] : this.elements[0];
  }

  /**
   * Get arguments (all elements except connector)
   */
  args() {
    return this.isAtom ? [] : this.elements.slice(1);
  }

  /**
   * Get atom type (first character after / in atom string)
   */
  atomType() {
    if (this.isAtom) {
      const parts = this.elements[0].split('/');
      if (parts.length > 1) {
        return parts[1].charAt(0);
      }
    }
    return null;
  }

  /**
   * Get main type from hyperedge
   */
  mtype() {
    if (this.isAtom) {
      return this.atomType();
    } else {
      // For non-atomic, get type from connector
      const conn = this.connector();
      if (conn instanceof Hyperedge) {
        return conn.mtype();
      } else if (typeof conn === 'string') {
        const parts = conn.split('/');
        if (parts.length > 1) {
          return parts[1].charAt(0);
        }
      }
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
    this.connector = connector; // Optional fixed connector pattern
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

    // For rules with specific connectors, check at least one matching element
    if (this.connector) {
      let hasConnector = false;
      for (let i = 0; i < this.arity; i++) {
        const atom = atoms[position + i];
        if (this.getAtomType(atom) === this.targetType) {
          hasConnector = true;
          break;
        }
      }
      if (!hasConnector) return false;
    }

    return true;
  }

  /**
   * Get atom type from atom object or hyperedge
   */
  getAtomType(atom) {
    if (typeof atom === "string") {
      const parts = atom.split('/');
      if (parts.length > 1) {
        return parts[1].charAt(0);
      }
      return 'C'; // fallback
    }
    if (atom instanceof Hyperedge) {
      return atom.mtype();
    }
    return atom.type || "C"; // fallback
  }

  /**
   * Apply rule at given position with pivot-based approach
   * FIXED: Now tries each position as potential connector
   */
  apply(atoms, position) {
    // Try each position in window as pivot (like Python)
    for (let pivotPos = 0; pivotPos < this.arity; pivotPos++) {
      const args = [];
      let pivot = null;
      let valid = true;

      for (let i = 0; i < this.arity; i++) {
        const windowPos = position + i;
        if (windowPos >= atoms.length) {
          valid = false;
          break;
        }

        const atom = atoms[windowPos];
        const atomType = this.getAtomType(atom);

        if (i === pivotPos) {
          // This position is the connector/pivot
          if (atomType === this.targetType) {
            if (this.connector) {
              args.push(atom); // Add to args, use explicit connector
            } else {
              pivot = atom; // Use this atom as connector
            }
          } else {
            valid = false;
            break;
          }
        } else {
          // This position is an argument
          if (this.allowedTypes.has(atomType)) {
            args.push(atom);
          } else {
            valid = false;
            break;
          }
        }
      }

      if (valid) {
        // Build the appropriate hyperedge
        return this.buildHyperedge(pivot, args);
      }
    }

    return null; // Rule cannot apply
  }

  /**
   * Build hyperedge based on rule type
   * FIXED: Now creates proper nested structures
   */
  buildHyperedge(pivot, args) {
    switch (this.targetType) {
      case "C":
        return this.buildConcept(pivot, args);
      case "M":
        return this.buildModifier(pivot, args);
      case "P":
        return this.buildPredicate(pivot, args);
      case "T":
        return this.buildTrigger(pivot, args);
      case "B":
        return this.buildBuilder(pivot, args);
      case "J":
        return this.buildJunction(pivot, args);
      default:
        return this.buildGeneric(pivot, args);
    }
  }

  /**
   * Build concept hyperedge
   * FIXED: Proper nesting for compound concepts
   */
  buildConcept(pivot, args) {
    // Handle explicit builder connector
    if (this.connector === '+/B/.') {
      // Compound concept: "White House", "New York"
      return new Hyperedge(['+/B/.', ...args]);
    }

    // For simple concept, just return it
    if (!pivot && args.length === 1) {
      return args[0];
    }

    return new Hyperedge([pivot || args[0], ...args.slice(pivot ? 0 : 1)]);
  }

  /**
   * Build modifier hyperedge
   * FIXED: Creates nested structure with target as connector
   */
  buildModifier(pivot, args) {
    if (args.length === 1) {
      // Modifier + target pattern
      const modifier = pivot;
      const target = args[0];
      
      // Create nested structure with target as connector
      // e.g., (the/Md (old/Ma man/Cc)) -> ((man/Cc old/Ma) the/Md)
      return new Hyperedge([target, modifier]);
    }
    
    return new Hyperedge([pivot, ...args]);
  }

  /**
   * Build predicate hyperedge
   * FIXED: Uses predicate as connector with proper argument ordering
   */
  buildPredicate(pivot, args) {
    // Predicate is the connector, args are its arguments
    return new Hyperedge([pivot, ...args]);
  }

  /**
   * Build trigger hyperedge
   */
  buildTrigger(pivot, args) {
    // Trigger + target pattern
    return new Hyperedge([pivot, ...args]);
  }

  /**
   * Build builder hyperedge
   * FIXED: Proper structure for compound concepts
   */
  buildBuilder(pivot, args) {
    if (args.length === 2) {
      // Pattern: concept + builder + concept -> (builder concept1 concept2)
      return new Hyperedge([pivot, ...args]);
    }
    return new Hyperedge([pivot, ...args]);
  }

  /**
   * Build junction hyperedge
   */
  buildJunction(pivot, args) {
    // Junction is the connector
    return new Hyperedge([pivot, ...args]);
  }

  /**
   * Generic hyperedge builder
   */
  buildGeneric(pivot, args) {
    if (this.connector) {
      return new Hyperedge([this.connector, ...args]);
    }
    return new Hyperedge([pivot, ...args]);
  }
}

class HypergraphParser {
  constructor() {
    this.rules = this.initializeGrammarRules();
    this.debug = false;
  }

  /**
   * Initialize Graphbrain's grammar rules
   * FIXED: Correct rule order and priorities
   */
  initializeGrammarRules() {
    const rules = [
      // CRITICAL: Rule order determines priority!
      new GrammarRule('C', ['C'], 2, '+/B/.'),           // Concept builder (HIGHEST)
      new GrammarRule('M', ['C', 'R', 'M', 'S', 'T', 'P', 'B', 'J'], 2),  // Modifier
      new GrammarRule('B', ['C', 'R'], 3),               // Builder construction
      new GrammarRule('T', ['C', 'R'], 2),               // Trigger specification
      new GrammarRule('P', ['C', 'R', 'S'], 6),          // Predicate (6 args)
      new GrammarRule('P', ['C', 'R', 'S'], 5),          // Predicate (5 args)
      new GrammarRule('P', ['C', 'R', 'S'], 4),          // Predicate (4 args)
      new GrammarRule('P', ['C', 'R', 'S'], 3),          // Predicate (3 args)
      new GrammarRule('P', ['C', 'R', 'S'], 2),          // Predicate (2 args)
      new GrammarRule('J', ['C', 'R', 'M', 'S', 'T', 'P', 'B', 'J'], 3), // Junction (3 args)
      new GrammarRule('J', ['C', 'R', 'M', 'S', 'T', 'P', 'B', 'J'], 2)  // Junction (LOWEST)
    ];

    // Set explicit priorities
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
   * FIXED: Finds best rule globally instead of sequentially
   */
  parseIteration(sequence) {
    let action = null;
    let bestScore = -999999999;

    // Try ALL rules at ALL valid positions (like Python)
    for (let ruleIndex = 0; ruleIndex < this.rules.length; ruleIndex++) {
      const rule = this.rules[ruleIndex];

      for (let pos = 0; pos <= sequence.length - rule.arity; pos++) {
        if (rule.canApply(sequence, pos)) {
          const newEdge = rule.apply(sequence, pos);

          if (newEdge) {
            // Score this specific rule application
            const window = sequence.slice(pos, pos + rule.arity);
            const score = this.scoreRuleApplication(rule, window, ruleIndex);

            if (score > bestScore) {
              action = {
                rule: rule,
                position: pos,
                newEdge: newEdge,
                arity: rule.arity
              };
              bestScore = score;
            }
          }
        }
      }
    }

    // Apply BEST rule or return unchanged if no rules applicable
    if (action) {
      const newSequence = [
        ...sequence.slice(0, action.position),
        action.newEdge,
        ...sequence.slice(action.position + action.arity)
      ];

      if (this.debug) {
        console.log(`Applied ${action.rule.targetType}(${action.arity}) at position ${action.position}: ${action.newEdge.toString()}`);
      }

      return newSequence;
    }

    return sequence; // No rules applicable - parsing complete
  }

  /**
   * Score a rule application
   * FIXED: Sophisticated scoring system based on Python implementation
   */
  scoreRuleApplication(rule, window, ruleIndex) {
    let score = 100000; // Base score

    // Rule priority: earlier rules get higher scores (like Python's rule_number penalty)
    score -= ruleIndex * 10000;

    // Huge bonus for predicates (sentence heads)
    if (rule.targetType === 'P') {
      score += 1000000;

      // Extra bonus for predicates with more arguments
      score += rule.arity * 50000;
    }

    // High bonus for builders (compound concepts)
    if (rule.targetType === 'B' || rule.connector === '+/B/.') {
      score += 500000;
    }

    // Significant bonus for modifiers (creates nesting)
    if (rule.targetType === 'M') {
      score += 200000;
    }

    // Bonus for triggers (spatial/temporal relations)
    if (rule.targetType === 'T') {
      score += 100000;
    }

    // Penalize junctions (should be last resort)
    if (rule.targetType === 'J') {
      score -= 100000;
    }

    // Bonus for combining more elements
    score += rule.arity * 1000;

    // TODO: Add connectivity bonus if dependency parsing info available
    // if (this.areConnected && this.areConnected(window)) {
    //     score += 10000000;  // Huge bonus for syntactic connectivity
    // }

    return score;
  }

  /**
   * Normalize atom sequence from classifier output
   * FIXED: Enhanced atom format inference
   */
  normalizeAtomSequence(atomSequence) {
    return atomSequence.map((atom) => {
      if (typeof atom === "string") {
        return atom;
      }

      if (atom.prediction && atom.features) {
        // From our classifier output
        const token = atom.features.token.toLowerCase();
        const type = atom.prediction;
        const subtype = this.inferSubtype(token, type, atom.features);
        return `${token}/${type}${subtype}`;
      }

      if (atom.token && atom.type) {
        // Simple token object
        const token = atom.token.toLowerCase();
        const subtype = this.inferSubtype(token, atom.type);
        return `${token}/${atom.type}${subtype}`;
      }

      return atom.toString();
    });
  }

  /**
   * Infer subtype based on token properties
   * FIXED: More comprehensive subtype inference
   */
  inferSubtype(token, type, features = {}) {
    switch (type) {
      case 'C':
        // Concept subtypes
        if (features.is_person || /^[A-Z][a-z]+$/.test(token)) {
          return 'p'; // Proper noun (Cp)
        }
        if (features.pos === 'PROPN' || /^[A-Z]/.test(token)) {
          return 'p'; // Proper noun
        }
        if (features.pos === 'ADJ' || features.is_adjective) {
          return 'a'; // Adjective concept (Ca)
        }
        if (features.pos === 'PRON' || features.is_pronoun) {
          return 'i'; // Pronoun (Ci)
        }
        if (features.pos === 'NUM' || /^\d+$/.test(token)) {
          return '#'; // Number (C#)
        }
        return 'c'; // Common concept (Cc)

      case 'M':
        // Modifier subtypes
        if (features.pos === 'ADV' || features.is_adverb) {
          return 'a'; // Adverb (Ma)
        }
        if (features.pos === 'DET' || features.is_determiner) {
          return 'd'; // Determiner (Md)
        }
        if (features.pos === 'ADJ' || features.is_adjective) {
          return 'a'; // Adjective (Ma)
        }
        if (token === 'his' || token === 'her' || token === 'their' || token === 'my' || token === 'your' || token === 'our') {
          return 'p'; // Possessive (Mp)
        }
        return ''; // Generic modifier (M)

      case 'P':
        // Predicate subtypes with roles
        return 'd.so'; // Declarative with subject-object (Pd.so)

      case 'B':
        // Builder subtypes
        return '.am'; // Auxiliary-main pattern (B.am)

      case 'T':
        // Trigger subtypes
        if (features.is_temporal || ['when', 'while', 'after', 'before', 'during'].includes(token)) {
          return 't'; // Temporal trigger (Tt)
        }
        return ''; // Generic trigger (T)

      case 'X':
        // Punctuation subtypes
        return '';

      default:
        return '';
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

  console.log("🧠 Hypergraph Parser Demonstration (Fixed)");
  console.log("=========================================\n");

  // Test cases from the fix document
  const testCases = [
    {
      name: "Simple sentence with modifiers",
      atoms: [
        { token: "The", type: "M", features: { pos: "DET", is_determiner: true } },
        { token: "old", type: "M", features: { pos: "ADJ", is_adjective: true } },
        { token: "man", type: "C", features: { pos: "NOUN" } },
        { token: "gave", type: "P", features: { pos: "VERB" } },
        { token: "his", type: "M", features: { pos: "PRON" } },
        { token: "grandson", type: "C", features: { pos: "NOUN" } },
        { token: "a", type: "M", features: { pos: "DET", is_determiner: true } },
        { token: "beautiful", type: "M", features: { pos: "ADJ", is_adjective: true } },
        { token: "book", type: "C", features: { pos: "NOUN" } }
      ],
      expected: "(gave/Pd.so (the/Md (old/Ma man/Cc)) (his/Mp grandson/Cc) (a/Md (beautiful/Ma book/Cc)))"
    },
    {
      name: "Sentence with builder and trigger",
      atoms: [
        { token: "Dr.", type: "C", features: { pos: "PROPN" } },
        { token: "Smith", type: "C", features: { pos: "PROPN" } },
        { token: "works", type: "P", features: { pos: "VERB" } },
        { token: "at", type: "T", features: { pos: "ADP" } },
        { token: "Harvard", type: "C", features: { pos: "PROPN" } },
        { token: "University", type: "C", features: { pos: "PROPN" } },
        { token: "in", type: "T", features: { pos: "ADP" } },
        { token: "Boston", type: "C", features: { pos: "PROPN" } }
      ],
      expected: "(works/Pd.so (+/B.am dr./Cp smith/Cp) (at/T (+/B.am harvard/Cp university/Cp)) (in/T boston/Cp))"
    }
  ];

  for (const testCase of testCases) {
    console.log(`\n📝 Test: ${testCase.name}`);
    console.log("─".repeat(50));
    
    const result = parser.parse(testCase.atoms);
    console.log(`\nResult: ${result.toString()}`);
    
    if (testCase.expected) {
      console.log(`Expected: ${testCase.expected}`);
    }
  }
}

/**
 * Parse classified text results from the semantic atom classifier
 */
function parseClassifiedText(classifierResults) {
  const parser = new HypergraphParser();

  // Filter out punctuation (X type) for cleaner hypergraphs
  const meaningfulAtoms = classifierResults.filter(
    (result) => result.prediction !== "X"
  );

  return parser.parse(meaningfulAtoms);
}

// Export classes and functions
module.exports = {
  Hyperedge,
  GrammarRule,
  HypergraphParser,
  parseClassifiedText,
  demonstrateParser
};

// Run demonstration if executed directly
if (require.main === module) {
  demonstrateParser();
}