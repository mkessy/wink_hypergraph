#!/usr/bin/env node

/**
 * JavaScript Hypergraph Parser - Version 2
 * 
 * More faithful implementation based on Python GraphBrain parser
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

  connector() {
    return this.isAtom ? this.elements[0] : this.elements[0];
  }

  args() {
    return this.isAtom ? [] : this.elements.slice(1);
  }

  mtype() {
    if (this.isAtom) {
      const parts = this.elements[0].split('/');
      if (parts.length > 1) {
        return parts[1].charAt(0);
      }
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
}

class Rule {
  constructor(firstType, argTypes, size, connector = null) {
    this.firstType = firstType;  // Type that must appear in the window
    this.argTypes = new Set(argTypes);  // Allowed argument types
    this.size = size;  // Window size
    this.connector = connector;  // Fixed connector if any
  }

  /**
   * Apply rule trying each position as pivot (Python-style)
   */
  applyRule(sentence, pos) {
    // Try each position in the window as the pivot
    for (let pivotPos = 0; pivotPos < this.size; pivotPos++) {
      const args = [];
      let pivot = null;
      let valid = true;

      for (let i = 0; i < this.size; i++) {
        const edge = sentence[pos - this.size + i + 1];
        if (!edge) {
          valid = false;
          break;
        }

        const edgeType = edge instanceof Hyperedge ? edge.mtype() : this.getAtomType(edge);

        if (i === pivotPos) {
          // This is the connector position
          if (edgeType === this.firstType) {
            if (this.connector) {
              args.push(edge);  // Use explicit connector
            } else {
              pivot = edge;  // Use edge as connector
            }
          } else {
            valid = false;
            break;
          }
        } else {
          // This is an argument position
          if (this.argTypes.has(edgeType)) {
            args.push(edge);
          } else {
            valid = false;
            break;
          }
        }
      }

      if (valid) {
        if (this.connector) {
          return new Hyperedge([this.connector, ...args]);
        } else if (pivot) {
          return new Hyperedge([pivot, ...args]);
        }
      }
    }

    return null;
  }

  getAtomType(atom) {
    if (typeof atom === "string") {
      const parts = atom.split('/');
      if (parts.length > 1) {
        return parts[1].charAt(0);
      }
    }
    return 'C';
  }
}

class HypergraphParserV2 {
  constructor() {
    // Define rules exactly as in Python
    this.rules = [
      new Rule('C', ['C'], 2, '+/B/.'),  // Concept builder
      new Rule('M', ['C', 'R', 'M', 'S', 'T', 'P', 'B', 'J'], 2),  // Modifier
      new Rule('B', ['C', 'R'], 3),  // Builder
      new Rule('T', ['C', 'R'], 2),  // Trigger
      new Rule('P', ['C', 'R', 'S'], 6),  // Predicate 6
      new Rule('P', ['C', 'R', 'S'], 5),  // Predicate 5
      new Rule('P', ['C', 'R', 'S'], 4),  // Predicate 4
      new Rule('P', ['C', 'R', 'S'], 3),  // Predicate 3
      new Rule('P', ['C', 'R', 'S'], 2),  // Predicate 2
      new Rule('J', ['C', 'R', 'M', 'S', 'T', 'P', 'B', 'J'], 3),  // Junction 3
      new Rule('J', ['C', 'R', 'M', 'S', 'T', 'P', 'B', 'J'], 2)   // Junction 2
    ];
    this.debug = false;
  }

  parse(atomSequence) {
    if (!atomSequence || atomSequence.length === 0) {
      return null;
    }

    // Convert to proper format
    let sequence = this.normalizeAtomSequence(atomSequence);

    if (this.debug) {
      console.log("Initial sequence:", sequence.map(a => a.toString()));
    }

    // Parse until no more rules apply
    let iteration = 0;
    while (true) {
      let action = null;
      let bestScore = -999999999;

      // Try all rules at all valid positions
      for (let ruleNumber = 0; ruleNumber < this.rules.length; ruleNumber++) {
        const rule = this.rules[ruleNumber];
        const windowStart = rule.size - 1;

        for (let pos = windowStart; pos < sequence.length; pos++) {
          const newEdge = rule.applyRule(sequence, pos);
          if (newEdge) {
            // Calculate score
            const score = this.score(sequence.slice(pos - windowStart, pos + 1)) - ruleNumber;
            
            if (score > bestScore) {
              bestScore = score;
              action = {
                rule: rule,
                ruleNumber: ruleNumber,
                newEdge: newEdge,
                windowStart: pos - windowStart,
                pos: pos
              };
            }
          }
        }
      }

      // Apply best rule
      if (action) {
        const { windowStart, pos, newEdge, rule, ruleNumber } = action;
        sequence = [
          ...sequence.slice(0, windowStart),
          newEdge,
          ...sequence.slice(pos + 1)
        ];

        if (this.debug) {
          console.log(`Iteration ${++iteration}: Applied rule ${ruleNumber} (${rule.firstType}), window size ${rule.size}`);
          console.log("New sequence:", sequence.map(a => a.toString()));
        }
      } else {
        break;  // No more rules apply
      }

      // Safety check
      if (iteration > 100) {
        console.warn("Max iterations reached");
        break;
      }
    }

    // Return result
    if (sequence.length === 1) {
      return sequence[0];
    } else {
      // Join with junction
      return new Hyperedge(['and/J', ...sequence]);
    }
  }

  score(edges) {
    // Simple scoring for now
    // In full implementation, would check syntactic connectivity
    let score = 100;
    
    // Prefer combining more complex structures
    edges.forEach(edge => {
      if (edge instanceof Hyperedge && !edge.isAtom) {
        score += 50;
      }
    });

    return score;
  }

  normalizeAtomSequence(atomSequence) {
    return atomSequence.map((atom) => {
      if (typeof atom === "string") {
        return new Hyperedge(atom);
      }

      if (atom.prediction && atom.features) {
        const token = atom.features.token.toLowerCase();
        const type = atom.prediction;
        const subtype = this.inferSubtype(token, type, atom.features);
        return new Hyperedge(`${token}/${type}${subtype}`);
      }

      if (atom.token && atom.type) {
        const token = atom.token.toLowerCase();
        const subtype = this.inferSubtype(token, atom.type, atom);
        return new Hyperedge(`${token}/${atom.type}${subtype}`);
      }

      return new Hyperedge(atom.toString());
    });
  }

  inferSubtype(token, type, features = {}) {
    switch (type) {
      case 'C':
        if (features.is_person || /^[A-Z]/.test(features.token || token)) {
          return 'p';  // Proper
        }
        if (features.pos === 'PRON') {
          return 'i';  // Pronoun
        }
        return 'c';  // Common

      case 'M':
        if (features.pos === 'DET' || features.is_determiner) {
          return 'd';  // Determiner
        }
        if (features.pos === 'ADJ' || features.is_adjective) {
          return 'a';  // Adjective
        }
        if (['his', 'her', 'their', 'my', 'your', 'our'].includes(token)) {
          return 'p';  // Possessive
        }
        return '';

      case 'P':
        return 'd.so';  // Declarative subject-object

      case 'B':
        return '.am';  // Auxiliary-main

      case 'T':
        return '';

      default:
        return '';
    }
  }

  setDebug(enabled) {
    this.debug = enabled;
  }
}

// Test it
function testParser() {
  const parser = new HypergraphParserV2();
  parser.setDebug(true);

  console.log("Testing HypergraphParserV2");
  console.log("==========================\n");

  // Test cases
  const tests = [
    {
      name: "Simple: 'old man'",
      atoms: [
        { token: "old", type: "M", features: { pos: "ADJ", is_adjective: true } },
        { token: "man", type: "C", features: { pos: "NOUN" } }
      ],
      expected: "(man/Cc old/Ma)"
    },
    {
      name: "With determiner: 'the old man'",
      atoms: [
        { token: "the", type: "M", features: { pos: "DET", is_determiner: true } },
        { token: "old", type: "M", features: { pos: "ADJ", is_adjective: true } },
        { token: "man", type: "C", features: { pos: "NOUN" } }
      ],
      expected: "((man/Cc old/Ma) the/Md)"
    },
    {
      name: "Full sentence",
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
      expected: "(gave/Pd.so ((man/Cc old/Ma) the/Md) (grandson/Cc his/Mp) ((book/Cc beautiful/Ma) a/Md))"
    }
  ];

  for (const test of tests) {
    console.log(`\nTest: ${test.name}`);
    console.log("─".repeat(40));
    
    const result = parser.parse(test.atoms);
    console.log(`\nResult: ${result.toString()}`);
    console.log(`Expected: ${test.expected}`);
  }
}

module.exports = {
  Hyperedge,
  Rule,
  HypergraphParserV2,
  testParser
};

if (require.main === module) {
  testParser();
}