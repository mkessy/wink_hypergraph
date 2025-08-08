#!/usr/bin/env node

/**
 * Syntactic Connectivity Enhancer
 * 
 * Implements the missing syntactic connectivity scoring from the hyper_graph_fix.md
 * Uses Compromise.js to determine syntactic relationships between atoms
 */

const compromise = require('compromise');

class SyntacticConnectivityAnalyzer {
  constructor() {
    this.dependencyCache = new Map();
  }

  /**
   * Analyze syntactic connectivity for a given text
   */
  analyzeSyntacticConnectivity(text) {
    const doc = compromise(text);
    const connectivity = {
      sentences: [],
      dependencies: [],
      chunks: [],
      phrases: []
    };

    // Analyze each sentence
    doc.sentences().forEach((sentence, sentIndex) => {
      const sentenceAnalysis = {
        index: sentIndex,
        text: sentence.text(),
        terms: [],
        dependencies: [],
        chunks: []
      };

      // Get detailed term information with positions
      const terms = sentence.terms().json();
      terms.forEach((term, termIndex) => {
        sentenceAnalysis.terms.push({
          index: termIndex,
          text: term.text,
          normal: term.normal || term.text.toLowerCase(),
          tag: term.tag,
          tags: term.tags || [],
          offset: term.offset || 0
        });
      });

      // Analyze chunks within the sentence
      sentence.chunks().forEach(chunk => {
        const chunkTerms = chunk.terms().json();
        sentenceAnalysis.chunks.push({
          text: chunk.text(),
          terms: chunkTerms.map(t => t.normal || t.text.toLowerCase()),
          tags: chunk.json()[0]?.tags || []
        });
      });

      // Build simple dependency relationships based on proximity and POS
      this.buildSimpleDependencies(sentenceAnalysis);
      
      connectivity.sentences.push(sentenceAnalysis);
    });

    return connectivity;
  }

  /**
   * Build simple dependency relationships using heuristics
   * (Since Compromise doesn't provide full dependency parsing)
   */
  buildSimpleDependencies(sentenceAnalysis) {
    const terms = sentenceAnalysis.terms;
    
    for (let i = 0; i < terms.length; i++) {
      const term = terms[i];
      
      // Determiner-Noun dependencies
      if (term.tags?.includes('Determiner') && i + 1 < terms.length) {
        const nextTerm = terms[i + 1];
        if (nextTerm.tags?.includes('Noun') || nextTerm.tags?.includes('Adjective')) {
          sentenceAnalysis.dependencies.push({
            head: nextTerm.normal,
            dependent: term.normal,
            relation: 'det',
            distance: 1
          });
        }
      }

      // Adjective-Noun dependencies
      if (term.tags?.includes('Adjective') && i + 1 < terms.length) {
        const nextTerm = terms[i + 1];
        if (nextTerm.tags?.includes('Noun')) {
          sentenceAnalysis.dependencies.push({
            head: nextTerm.normal,
            dependent: term.normal,
            relation: 'amod',
            distance: 1
          });
        }
      }

      // Noun-Noun dependencies (compounds)
      if (term.tags?.includes('Noun') && i + 1 < terms.length) {
        const nextTerm = terms[i + 1];
        if (nextTerm.tags?.includes('Noun')) {
          sentenceAnalysis.dependencies.push({
            head: nextTerm.normal,
            dependent: term.normal,
            relation: 'compound',
            distance: 1
          });
        }
      }

      // Verb-Noun dependencies (subject/object relationships)
      if (term.tags?.includes('Verb')) {
        // Look for nearby nouns as potential subjects/objects
        for (let j = Math.max(0, i - 3); j < Math.min(terms.length, i + 4); j++) {
          if (j !== i && terms[j].tags?.includes('Noun')) {
            const relation = j < i ? 'nsubj' : 'dobj';
            sentenceAnalysis.dependencies.push({
              head: term.normal,
              dependent: terms[j].normal,
              relation: relation,
              distance: Math.abs(i - j)
            });
          }
        }
      }

      // Preposition dependencies
      if (term.tags?.includes('Preposition') && i + 1 < terms.length) {
        const nextTerm = terms[i + 1];
        if (nextTerm.tags?.includes('Noun')) {
          sentenceAnalysis.dependencies.push({
            head: term.normal,
            dependent: nextTerm.normal,
            relation: 'pobj',
            distance: 1
          });
        }
      }
    }
  }

  /**
   * Check if a set of atoms are syntactically connected
   */
  areConnected(atoms, connectivityAnalysis) {
    if (atoms.length <= 1) return true;

    const atomNormals = atoms.map(atom => {
      if (typeof atom === 'string') {
        return atom.split('/')[0].toLowerCase();
      }
      return atom.features?.token?.toLowerCase() || atom.toString().toLowerCase();
    });

    // Check if any dependency relationships exist between these atoms
    for (const sentence of connectivityAnalysis.sentences) {
      for (const dep of sentence.dependencies) {
        const headInSet = atomNormals.includes(dep.head);
        const depInSet = atomNormals.includes(dep.dependent);
        
        if (headInSet && depInSet) {
          return true; // Found a syntactic connection
        }
      }

      // Also check chunks - atoms in the same chunk are connected
      for (const chunk of sentence.chunks) {
        const chunkAtoms = chunk.terms.filter(term => atomNormals.includes(term));
        if (chunkAtoms.length >= 2) {
          return true; // Multiple atoms from our set in the same chunk
        }
      }
    }

    // Check proximity as fallback (adjacent or very close atoms are likely connected)
    if (this.areProximate(atomNormals, connectivityAnalysis)) {
      return true;
    }

    return false;
  }

  /**
   * Check if atoms are proximate (close together) in the text
   */
  areProximate(atomNormals, connectivityAnalysis) {
    for (const sentence of connectivityAnalysis.sentences) {
      const positions = [];
      
      sentence.terms.forEach((term, index) => {
        if (atomNormals.includes(term.normal)) {
          positions.push(index);
        }
      });

      if (positions.length >= 2) {
        positions.sort((a, b) => a - b);
        for (let i = 1; i < positions.length; i++) {
          if (positions[i] - positions[i-1] <= 2) { // Within 2 positions
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * Calculate minimum dependency depth for a set of atoms
   */
  calculateMinDependencyDepth(atoms, connectivityAnalysis) {
    // Simple heuristic: return the minimum distance between any two connected atoms
    let minDepth = 999;
    
    for (const sentence of connectivityAnalysis.sentences) {
      for (const dep of sentence.dependencies) {
        minDepth = Math.min(minDepth, dep.distance);
      }
    }

    return minDepth === 999 ? 1 : minDepth;
  }

  /**
   * Enhanced scoring that includes syntactic connectivity
   * This implements the missing piece from hyper_graph_fix.md
   */
  scoreWithConnectivity(atoms, baseScore, connectivityAnalysis) {
    let enhancedScore = baseScore;

    // Check syntactic connectivity (huge bonus like in Python)
    if (this.areConnected(atoms, connectivityAnalysis)) {
      enhancedScore += 10000000; // Massive bonus for syntactic connectivity
    }

    // Prefer structures with minimum dependency depth
    const minDepth = this.calculateMinDependencyDepth(atoms, connectivityAnalysis);
    enhancedScore += minDepth * 100;

    // Additional adjustments based on linguistic patterns
    enhancedScore += this.adjustScoreForLinguisticPatterns(atoms, connectivityAnalysis);

    return enhancedScore;
  }

  /**
   * Additional score adjustments based on linguistic patterns
   */
  adjustScoreForLinguisticPatterns(atoms, connectivityAnalysis) {
    let adjustment = 0;

    // Bonus for determiner-noun pairs
    for (let i = 0; i < atoms.length - 1; i++) {
      const current = atoms[i];
      const next = atoms[i + 1];
      
      if (this.isType(current, 'M') && this.isType(next, 'C')) {
        adjustment += 500; // Bonus for modifier-concept pairs
      }
    }

    // Bonus for verb-argument structures
    const hasVerb = atoms.some(atom => this.isType(atom, 'P'));
    const hasNouns = atoms.filter(atom => this.isType(atom, 'C')).length;
    
    if (hasVerb && hasNouns >= 2) {
      adjustment += 1000; // Bonus for predicate-argument structures
    }

    return adjustment;
  }

  /**
   * Check if an atom is of a specific type
   */
  isType(atom, type) {
    if (typeof atom === 'string') {
      return atom.split('/')[1]?.charAt(0) === type;
    }
    if (atom.prediction) {
      return atom.prediction === type;
    }
    return false;
  }
}

module.exports = {
  SyntacticConnectivityAnalyzer
};

// Demonstration
if (require.main === module) {
  const analyzer = new SyntacticConnectivityAnalyzer();
  
  const testText = "The old man gave his grandson a beautiful book.";
  console.log('🔍 Analyzing syntactic connectivity for:', testText);
  
  const connectivity = analyzer.analyzeSyntacticConnectivity(testText);
  console.log('\n📊 Connectivity Analysis:');
  console.log('Sentences:', connectivity.sentences.length);
  
  connectivity.sentences.forEach((sent, i) => {
    console.log(`\nSentence ${i + 1}: "${sent.text}"`);
    console.log('Terms:', sent.terms.map(t => `${t.text}(${t.tags?.join(',')})`).join(', '));
    console.log('Dependencies:', sent.dependencies.length);
    sent.dependencies.forEach(dep => {
      console.log(`  ${dep.dependent} --${dep.relation}--> ${dep.head} (dist: ${dep.distance})`);
    });
  });

  // Test connectivity checking
  const testAtoms = ['the', 'old', 'man'];
  const connected = analyzer.areConnected(testAtoms, connectivity);
  console.log(`\n🔗 Are atoms [${testAtoms.join(', ')}] connected?`, connected);
}