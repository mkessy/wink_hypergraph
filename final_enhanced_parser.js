#!/usr/bin/env node

/**
 * Final Enhanced Hypergraph Parser
 * 
 * Integrates all fixes from hyper_graph_fix.md including the missing syntactic connectivity scoring
 */

const compromise = require('compromise');
const SemanticAtomClassifier = require('./semantic_atom_classifier');

class FinalEnhancedParser {
  constructor() {
    this.classifier = new SemanticAtomClassifier();
    this.debug = false;
    
    // Rules exactly as specified in hyper_graph_fix.md
    this.rules = [
      { type: 'C', allowedTypes: ['C'], size: 2, connector: '+/B/.', priority: 0 },
      { type: 'M', allowedTypes: ['C', 'R', 'M', 'S', 'T', 'P', 'B', 'J'], size: 2, priority: 1 },
      { type: 'B', allowedTypes: ['C', 'R'], size: 3, priority: 2 },
      { type: 'T', allowedTypes: ['C', 'R'], size: 2, priority: 3 },
      { type: 'P', allowedTypes: ['C', 'R', 'S'], size: 6, priority: 4 },
      { type: 'P', allowedTypes: ['C', 'R', 'S'], size: 5, priority: 5 },
      { type: 'P', allowedTypes: ['C', 'R', 'S'], size: 4, priority: 6 },
      { type: 'P', allowedTypes: ['C', 'R', 'S'], size: 3, priority: 7 },
      { type: 'P', allowedTypes: ['C', 'R', 'S'], size: 2, priority: 8 },
      { type: 'J', allowedTypes: ['C', 'R', 'M', 'S', 'T', 'P', 'B', 'J'], size: 3, priority: 9 },
      { type: 'J', allowedTypes: ['C', 'R', 'M', 'S', 'T', 'P', 'B', 'J'], size: 2, priority: 10 }
    ];
  }

  async initialize() {
    try {
      this.classifier.loadModels('./models');
      console.log('✅ Loaded semantic atom classifier models');
      return true;
    } catch (error) {
      console.log('⚠️  Could not load classifier models');
      return false;
    }
  }

  /**
   * Enhanced preprocessing with Compromise
   */
  preprocessText(text) {
    const doc = compromise(text);
    doc.contractions().expand();
    doc.normalize();
    return doc.text();
  }

  /**
   * Enhanced classification with Compromise features
   */
  enhanceClassifications(text) {
    const doc = compromise(text);
    const baseClassifications = this.classifier.classifyText(text);
    
    // Get Compromise analysis
    const people = new Set(doc.people().json().map(p => p.normal?.toLowerCase() || p.text?.toLowerCase()));
    const places = new Set(doc.places().json().map(p => p.normal?.toLowerCase() || p.text?.toLowerCase()));
    const orgs = new Set(doc.organizations().json().map(o => o.normal?.toLowerCase() || o.text?.toLowerCase()));
    const numbers = new Set(doc.numbers().json().map(n => n.text?.toLowerCase()));
    
    // POS-based sets
    const verbs = new Set(doc.verbs().json().map(v => v.normal?.toLowerCase() || v.text?.toLowerCase()));
    const nouns = new Set(doc.nouns().json().map(n => n.normal?.toLowerCase() || n.text?.toLowerCase()));
    const adjectives = new Set(doc.adjectives().json().map(a => a.normal?.toLowerCase() || a.text?.toLowerCase()));
    const adverbs = new Set(doc.adverbs().json().map(a => a.normal?.toLowerCase() || a.text?.toLowerCase()));
    const prepositions = new Set(doc.match('#Preposition').json().map(p => p.normal?.toLowerCase() || p.text?.toLowerCase()));
    const conjunctions = new Set(doc.match('#Conjunction').json().map(c => c.normal?.toLowerCase() || c.text?.toLowerCase()));
    const determiners = new Set(doc.match('#Determiner').json().map(d => d.normal?.toLowerCase() || d.text?.toLowerCase()));

    // Enhance classifications
    const enhanced = baseClassifications.map(classification => {
      const token = classification.features.token.toLowerCase();
      let newPrediction = classification.prediction;
      let newConfidence = classification.confidence;
      const enhancements = [];

      // Named entity corrections
      if (people.has(token) || places.has(token) || orgs.has(token)) {
        if (newPrediction !== 'C') {
          newPrediction = 'C';
          newConfidence = Math.max(newConfidence, 0.95);
          enhancements.push('Named entity → C');
        }
      }

      // POS-based corrections with high confidence
      if (verbs.has(token) && newPrediction !== 'P') {
        newPrediction = 'P';
        newConfidence = Math.max(newConfidence, 0.9);
        enhancements.push('Verb → P');
      }

      if (prepositions.has(token) && newPrediction !== 'T') {
        newPrediction = 'T';
        newConfidence = Math.max(newConfidence, 0.9);
        enhancements.push('Preposition → T');
      }

      if (conjunctions.has(token) && newPrediction !== 'J') {
        newPrediction = 'J';
        newConfidence = Math.max(newConfidence, 0.9);
        enhancements.push('Conjunction → J');
      }

      if ((adjectives.has(token) || adverbs.has(token) || determiners.has(token) || numbers.has(token)) && newPrediction !== 'M') {
        newPrediction = 'M';
        newConfidence = Math.max(newConfidence, 0.85);
        enhancements.push('Modifier → M');
      }

      if (nouns.has(token) && newPrediction !== 'C') {
        newPrediction = 'C';
        newConfidence = Math.max(newConfidence, 0.8);
        enhancements.push('Noun → C');
      }

      return {
        ...classification,
        prediction: newPrediction,
        confidence: newConfidence,
        enhancements: enhancements
      };
    });

    return enhanced;
  }

  /**
   * Build syntactic connectivity map
   */
  buildConnectivityMap(text, atoms) {
    const doc = compromise(text);
    const connectivityMap = new Map();
    
    // Build proximity relationships
    const terms = doc.terms().json();
    for (let i = 0; i < terms.length; i++) {
      const term = terms[i];
      const termNormal = term.normal?.toLowerCase() || term.text?.toLowerCase();
      
      // Find adjacent terms
      const adjacentTerms = [];
      if (i > 0) adjacentTerms.push(terms[i-1].normal?.toLowerCase() || terms[i-1].text?.toLowerCase());
      if (i < terms.length - 1) adjacentTerms.push(terms[i+1].normal?.toLowerCase() || terms[i+1].text?.toLowerCase());
      
      connectivityMap.set(termNormal, adjacentTerms);
    }

    // Add chunk-based connectivity
    doc.chunks().forEach(chunk => {
      const chunkTerms = chunk.terms().json().map(t => t.normal?.toLowerCase() || t.text?.toLowerCase());
      chunkTerms.forEach(term1 => {
        chunkTerms.forEach(term2 => {
          if (term1 !== term2) {
            if (!connectivityMap.has(term1)) connectivityMap.set(term1, []);
            if (!connectivityMap.get(term1).includes(term2)) {
              connectivityMap.get(term1).push(term2);
            }
          }
        });
      });
    });

    return connectivityMap;
  }

  /**
   * Check if atoms are syntactically connected
   */
  areConnected(atoms, connectivityMap) {
    if (atoms.length <= 1) return true;
    
    const atomTokens = atoms.map(atom => {
      if (typeof atom === 'string') {
        return atom.split('/')[0].toLowerCase();
      }
      return atom.features?.token?.toLowerCase() || atom.toString().toLowerCase();
    });

    // Check if any pair is connected
    for (let i = 0; i < atomTokens.length; i++) {
      for (let j = i + 1; j < atomTokens.length; j++) {
        const token1 = atomTokens[i];
        const token2 = atomTokens[j];
        
        const connections1 = connectivityMap.get(token1) || [];
        const connections2 = connectivityMap.get(token2) || [];
        
        if (connections1.includes(token2) || connections2.includes(token1)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Apply rule with pivot-based approach (from hyper_graph_fix.md)
   */
  applyRuleWithPivot(rule, atoms, position, connectivityMap) {
    const windowSize = rule.size;
    if (position + windowSize > atoms.length) return null;

    // Try each position in window as pivot
    for (let pivotPos = 0; pivotPos < windowSize; pivotPos++) {
      const args = [];
      let pivot = null;
      let valid = true;

      for (let i = 0; i < windowSize; i++) {
        const atom = atoms[position + i];
        const atomType = this.getAtomType(atom);

        if (i === pivotPos) {
          // This is the connector position
          if (atomType === rule.type) {
            if (rule.connector) {
              args.push(atom);
            } else {
              pivot = atom;
            }
          } else {
            valid = false;
            break;
          }
        } else {
          // This is an argument position
          if (rule.allowedTypes.includes(atomType)) {
            args.push(atom);
          } else {
            valid = false;
            break;
          }
        }
      }

      if (valid) {
        // Build appropriate hyperedge based on rule type
        return this.buildHyperedge(rule, pivot, args);
      }
    }

    return null;
  }

  /**
   * Get atom type
   */
  getAtomType(atom) {
    if (typeof atom === 'string') {
      return atom.split('/')[1]?.charAt(0) || 'C';
    }
    if (atom.prediction) {
      return atom.prediction;
    }
    return 'C';
  }

  /**
   * Build hyperedge with proper nesting (from hyper_graph_fix.md)
   */
  buildHyperedge(rule, pivot, args) {
    switch (rule.type) {
      case 'C':
        if (rule.connector === '+/B/.') {
          return { type: 'hyperedge', elements: ['+/B/.', ...args] };
        }
        return { type: 'hyperedge', elements: [pivot || args[0], ...args.slice(pivot ? 0 : 1)] };
      
      case 'M':
        // Modifier creates nested structure with target as connector
        if (args.length === 1) {
          const modifier = pivot;
          const target = args[0];
          return { type: 'hyperedge', elements: [target, modifier] };
        }
        return { type: 'hyperedge', elements: [pivot, ...args] };
      
      case 'P':
        // Predicate as connector with arguments
        return { type: 'hyperedge', elements: [pivot, ...args] };
      
      case 'T':
        // Trigger + target
        return { type: 'hyperedge', elements: [pivot, ...args] };
      
      case 'B':
        // Builder
        return { type: 'hyperedge', elements: [pivot, ...args] };
      
      case 'J':
        // Junction
        return { type: 'hyperedge', elements: [pivot, ...args] };
      
      default:
        return { type: 'hyperedge', elements: [pivot, ...args] };
    }
  }

  /**
   * Enhanced scoring with syntactic connectivity (implementing missing piece from hyper_graph_fix.md)
   */
  scoreRuleApplication(rule, window, connectivityMap) {
    let score = 100000; // Base score
    
    // Rule priority: earlier rules get higher scores
    score -= rule.priority * 10000;

    // Type-specific bonuses
    if (rule.type === 'P') {
      score += 1000000; // Huge bonus for predicates
      score += rule.size * 50000; // Bonus for more arguments
    } else if (rule.type === 'B' || rule.connector === '+/B/.') {
      score += 500000; // High bonus for builders
    } else if (rule.type === 'M') {
      score += 200000; // Significant bonus for modifiers
    } else if (rule.type === 'T') {
      score += 100000; // Bonus for triggers
    } else if (rule.type === 'J') {
      score -= 100000; // Penalize junctions
    }

    // Bonus for combining more elements
    score += rule.size * 1000;

    // CRITICAL: Syntactic connectivity bonus (the missing piece!)
    if (this.areConnected(window, connectivityMap)) {
      score += 10000000; // Huge bonus for syntactic connectivity (like Python)
    }

    return score;
  }

  /**
   * Parse with global best-rule selection (from hyper_graph_fix.md)
   */
  parseIteration(atoms, connectivityMap) {
    let bestAction = null;
    let bestScore = -999999999;

    // Try ALL rules at ALL valid positions
    for (const rule of this.rules) {
      for (let pos = 0; pos <= atoms.length - rule.size; pos++) {
        const newEdge = this.applyRuleWithPivot(rule, atoms, pos, connectivityMap);
        
        if (newEdge) {
          const window = atoms.slice(pos, pos + rule.size);
          const score = this.scoreRuleApplication(rule, window, connectivityMap);
          
          if (score > bestScore) {
            bestAction = {
              rule: rule,
              position: pos,
              newEdge: newEdge,
              size: rule.size
            };
            bestScore = score;
          }
        }
      }
    }

    // Apply best rule
    if (bestAction) {
      const newSequence = [
        ...atoms.slice(0, bestAction.position),
        bestAction.newEdge,
        ...atoms.slice(bestAction.position + bestAction.size)
      ];

      if (this.debug) {
        console.log(`Applied ${bestAction.rule.type}(${bestAction.rule.size}) at ${bestAction.position}: score=${bestScore}`);
      }

      return newSequence;
    }

    return atoms; // No rules applicable
  }

  /**
   * Convert hyperedge to string
   */
  hyperedgeToString(hyperedge) {
    if (typeof hyperedge === 'string') return hyperedge;
    if (hyperedge.type === 'hyperedge') {
      return '(' + hyperedge.elements.map(e => this.hyperedgeToString(e)).join(' ') + ')';
    }
    return hyperedge.toString();
  }

  /**
   * Main parsing method
   */
  parse(text) {
    if (this.debug) {
      console.log(`\n📝 Parsing: "${text}"`);
      console.log('─'.repeat(60));
    }

    // Step 1: Preprocess
    const preprocessed = this.preprocessText(text);

    // Step 2: Enhanced classification
    const enhancedAtoms = this.enhanceClassifications(preprocessed);

    // Step 3: Build connectivity map
    const connectivityMap = this.buildConnectivityMap(preprocessed, enhancedAtoms);

    // Step 4: Parse with iterations
    let sequence = enhancedAtoms.filter(atom => atom.prediction !== 'X'); // Remove punctuation
    let iteration = 0;
    const maxIterations = sequence.length * 2;

    while (sequence.length > 1 && iteration < maxIterations) {
      const originalLength = sequence.length;
      sequence = this.parseIteration(sequence, connectivityMap);
      
      if (sequence.length === originalLength) {
        break; // No more rules applicable
      }
      iteration++;
    }

    // Convert to final result
    let result;
    if (sequence.length === 1) {
      result = sequence[0];
    } else {
      result = { type: 'hyperedge', elements: ['and/J', ...sequence] };
    }

    if (this.debug) {
      console.log('\n🧠 Final Hypergraph:');
      console.log(`   ${this.hyperedgeToString(result)}`);
    }

    return result;
  }

  setDebug(enabled) {
    this.debug = enabled;
  }
}

// Demonstration
async function demonstrateFinalParser() {
  console.log('🚀 Final Enhanced Hypergraph Parser');
  console.log('===================================');
  console.log('✨ Includes ALL fixes from hyper_graph_fix.md');
  console.log('✨ Syntactic connectivity scoring implemented\n');

  const parser = new FinalEnhancedParser();
  parser.setDebug(true);

  const initialized = await parser.initialize();
  if (!initialized) {
    console.log('❌ Could not initialize parser');
    return;
  }

  // Test sentences
  const testSentences = [
    "The old man gave his grandson a beautiful book.",
    "John loves Mary.",
    "Dr. Smith works at Harvard University in Boston.",
    "The quick brown fox jumps over the lazy dog.",
    "Alice and Bob went to New York."
  ];

  for (const sentence of testSentences) {
    parser.parse(sentence);
    console.log('\n' + '═'.repeat(80));
  }

  console.log('\n✅ Final enhanced parser demonstration complete!');
}

module.exports = {
  FinalEnhancedParser
};

if (require.main === module) {
  demonstrateFinalParser().catch(console.error);
}