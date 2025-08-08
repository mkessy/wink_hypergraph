#!/usr/bin/env node

/**
 * Enhanced Compromise.js Hypergraph Parser v2
 * 
 * Uses actually available Compromise.js features to enhance semantic parsing
 */

const compromise = require('compromise');
const SemanticAtomClassifier = require('./semantic_atom_classifier');
const { HypergraphParser } = require('./hyper_graph_parser_fixed');

class EnhancedCompromiseParserV2 {
  constructor() {
    this.classifier = new SemanticAtomClassifier();
    this.parser = new HypergraphParser();
    this.debug = false;
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
   * Enhanced text preprocessing using available Compromise features
   */
  preprocessText(text) {
    const doc = compromise(text);
    
    // Expand contractions for better parsing
    doc.contractions().expand();
    
    // Normalize text
    doc.normalize();
    
    return doc.text();
  }

  /**
   * Extract comprehensive linguistic features using available Compromise methods
   */
  extractCompromiseFeatures(text) {
    const doc = compromise(text);
    const features = {};

    // Named entities (available methods)
    features.people = doc.people().json() || [];
    features.places = doc.places().json() || [];
    features.organizations = doc.organizations().json() || [];
    features.numbers = doc.numbers ? doc.numbers().json() || [] : [];

    // Syntactic structures
    features.sentences = doc.sentences().json() || [];
    features.chunks = doc.chunks().json() || [];
    features.clauses = doc.clauses ? doc.clauses().json() || [] : [];

    // POS-based extractions
    features.nouns = doc.nouns().json() || [];
    features.verbs = doc.verbs().json() || [];
    features.adjectives = doc.adjectives().json() || [];
    features.adverbs = doc.adverbs().json() || [];
    features.prepositions = doc.match('#Preposition').json() || [];
    features.conjunctions = doc.match('#Conjunction').json() || [];
    features.determiners = doc.match('#Determiner').json() || [];

    // Get detailed term information
    features.terms = doc.terms().json() || [];

    // Additional useful extractions
    features.acronyms = doc.acronyms().json() || [];
    features.abbreviations = doc.abbreviations().json() || [];
    features.quotations = doc.quotations().json() || [];

    return features;
  }

  /**
   * Create enhanced atom classifications using Compromise insights
   */
  enhanceClassifications(classifications, compromiseFeatures) {
    const enhanced = [...classifications];
    
    // Create lookup maps for different entity types
    const entityMaps = {
      people: new Map(),
      places: new Map(), 
      organizations: new Map(),
      numbers: new Map(),
      nouns: new Map(),
      verbs: new Map(),
      adjectives: new Map(),
      adverbs: new Map(),
      prepositions: new Map(),
      conjunctions: new Map(),
      determiners: new Map()
    };

    // Populate entity maps
    Object.keys(entityMaps).forEach(key => {
      if (compromiseFeatures[key]) {
        compromiseFeatures[key].forEach(item => {
          const normalized = item.normal?.toLowerCase() || item.text?.toLowerCase();
          if (normalized) {
            entityMaps[key].set(normalized, item);
          }
        });
      }
    });

    // Enhance each classification
    enhanced.forEach((classification, index) => {
      const token = classification.features.token.toLowerCase();
      const originalPrediction = classification.prediction;
      let newPrediction = originalPrediction;
      let confidence = classification.confidence;
      const enhancements = [];

      // Check entity types and adjust classifications
      if (entityMaps.people.has(token)) {
        if (originalPrediction !== 'C') {
          newPrediction = 'C';
          confidence = Math.max(confidence, 0.95);
          enhancements.push('Person entity → C');
        }
        classification.entityType = 'person';
        classification.entityInfo = entityMaps.people.get(token);
      }

      if (entityMaps.places.has(token)) {
        if (originalPrediction !== 'C') {
          newPrediction = 'C';
          confidence = Math.max(confidence, 0.95);
          enhancements.push('Place entity → C');
        }
        classification.entityType = 'place';
        classification.entityInfo = entityMaps.places.get(token);
      }

      if (entityMaps.organizations.has(token)) {
        if (originalPrediction !== 'C') {
          newPrediction = 'C';
          confidence = Math.max(confidence, 0.95);
          enhancements.push('Organization entity → C');
        }
        classification.entityType = 'organization';
        classification.entityInfo = entityMaps.organizations.get(token);
      }

      if (entityMaps.numbers.has(token)) {
        if (originalPrediction !== 'M') {
          newPrediction = 'M';
          confidence = Math.max(confidence, 0.9);
          enhancements.push('Number → M');
        }
        classification.entityType = 'number';
        classification.entityInfo = entityMaps.numbers.get(token);
      }

      // POS-based corrections
      if (entityMaps.verbs.has(token) && originalPrediction !== 'P') {
        newPrediction = 'P';
        confidence = Math.max(confidence, 0.85);
        enhancements.push('Verb → P');
      }

      if ((entityMaps.adjectives.has(token) || entityMaps.adverbs.has(token) || 
           entityMaps.determiners.has(token)) && originalPrediction !== 'M') {
        newPrediction = 'M';
        confidence = Math.max(confidence, 0.85);
        enhancements.push('Modifier → M');
      }

      if (entityMaps.prepositions.has(token) && originalPrediction !== 'T') {
        newPrediction = 'T';
        confidence = Math.max(confidence, 0.85);
        enhancements.push('Preposition → T');
      }

      if (entityMaps.conjunctions.has(token) && originalPrediction !== 'J') {
        newPrediction = 'J';
        confidence = Math.max(confidence, 0.85);
        enhancements.push('Conjunction → J');
      }

      if (entityMaps.nouns.has(token) && originalPrediction !== 'C') {
        newPrediction = 'C';
        confidence = Math.max(confidence, 0.8);
        enhancements.push('Noun → C');
      }

      // Apply enhancements
      if (enhancements.length > 0) {
        classification.prediction = newPrediction;
        classification.confidence = confidence;
        classification.compromiseEnhancements = enhancements;
        
        if (this.debug) {
          console.log(`    Enhanced ${token}: ${enhancements.join(', ')}`);
        }
      }
    });

    return enhanced;
  }

  /**
   * Identify syntactic relationships for better hypergraph construction
   */
  identifySyntacticRelationships(compromiseFeatures) {
    const relationships = {
      nounPhrases: [],
      verbPhrases: [],
      prepositionalPhrases: [],
      compoundNouns: [],
      modifierRelations: []
    };

    // Analyze chunks for noun phrases
    compromiseFeatures.chunks.forEach(chunk => {
      if (chunk.tags && chunk.tags.includes('Noun')) {
        const terms = chunk.terms || [];
        if (terms.length > 1) {
          relationships.nounPhrases.push({
            text: chunk.text,
            terms: terms,
            head: terms.find(t => t.tags?.includes('Noun')),
            modifiers: terms.filter(t => t.tags?.includes('Adjective') || t.tags?.includes('Determiner'))
          });
        }
      }
    });

    // Identify compound nouns (sequences of nouns)
    const nouns = compromiseFeatures.nouns;
    for (let i = 0; i < nouns.length - 1; i++) {
      const current = nouns[i];
      const next = nouns[i + 1];
      
      // Check if they're adjacent (simple heuristic)
      if (Math.abs((current.offset || 0) - (next.offset || 0)) <= 2) {
        relationships.compoundNouns.push({
          compound: [current, next],
          text: `${current.text} ${next.text}`
        });
      }
    }

    // Identify modifier relationships
    compromiseFeatures.adjectives.forEach(adj => {
      // Find nearby nouns that this adjective might modify
      const nearbyNouns = compromiseFeatures.nouns.filter(noun => {
        const adjOffset = adj.offset || 0;
        const nounOffset = noun.offset || 0;
        return Math.abs(adjOffset - nounOffset) <= 3;
      });
      
      if (nearbyNouns.length > 0) {
        relationships.modifierRelations.push({
          modifier: adj,
          targets: nearbyNouns
        });
      }
    });

    return relationships;
  }

  /**
   * Process text with enhanced Compromise analysis
   */
  processText(text) {
    if (this.debug) {
      console.log(`\n📝 Processing: "${text}"`);
      console.log('─'.repeat(60));
    }

    // Step 1: Preprocess text
    const preprocessed = this.preprocessText(text);
    if (this.debug && preprocessed !== text) {
      console.log(`🔧 Preprocessed: "${preprocessed}"`);
    }

    // Step 2: Extract Compromise features
    const compromiseFeatures = this.extractCompromiseFeatures(preprocessed);
    
    // Step 3: Get base classifications
    const baseClassifications = this.classifier.classifyText(preprocessed);
    
    // Step 4: Enhance with Compromise insights
    const enhancedClassifications = this.enhanceClassifications(baseClassifications, compromiseFeatures);
    
    // Step 5: Identify syntactic relationships
    const relationships = this.identifySyntacticRelationships(compromiseFeatures);
    
    // Step 6: Parse into hypergraph (using existing parser for now)
    const hypergraph = this.parser.parse(enhancedClassifications);

    if (this.debug) {
      console.log('\n🔍 Compromise Analysis:');
      console.log(`    People: ${compromiseFeatures.people.map(p => p.text).join(', ') || 'none'}`);
      console.log(`    Places: ${compromiseFeatures.places.map(p => p.text).join(', ') || 'none'}`);
      console.log(`    Organizations: ${compromiseFeatures.organizations.map(o => o.text).join(', ') || 'none'}`);
      console.log(`    Numbers: ${compromiseFeatures.numbers.map(n => n.text).join(', ') || 'none'}`);
      console.log(`    Noun phrases: ${relationships.nounPhrases.length}`);
      console.log(`    Compound nouns: ${relationships.compoundNouns.length}`);
      console.log(`    Modifier relations: ${relationships.modifierRelations.length}`);

      console.log('\n🏷️  Enhanced Classifications:');
      enhancedClassifications.forEach((cls, i) => {
        const token = cls.features.token;
        const type = cls.prediction;
        const conf = (cls.confidence * 100).toFixed(1);
        const entityInfo = cls.entityType ? ` [${cls.entityType}]` : '';
        const enhancements = cls.compromiseEnhancements?.length > 0 ? ` (${cls.compromiseEnhancements.join(', ')})` : '';
        console.log(`      ${i + 1}. ${token} -> ${type} (${conf}%)${entityInfo}${enhancements}`);
      });

      if (hypergraph) {
        console.log('\n🧠 Hypergraph:');
        console.log(`      ${hypergraph.toString()}`);
      }
    }

    return {
      text: text,
      preprocessed: preprocessed,
      compromiseFeatures: compromiseFeatures,
      baseClassifications: baseClassifications,
      enhancedClassifications: enhancedClassifications,
      relationships: relationships,
      hypergraph: hypergraph
    };
  }

  setDebug(enabled) {
    this.debug = enabled;
    this.parser.setDebug(enabled);
  }
}

/**
 * Demonstration function
 */
async function demonstrateEnhancedParserV2() {
  console.log('🚀 Enhanced Compromise.js Hypergraph Parser v2');
  console.log('=============================================\n');

  const parser = new EnhancedCompromiseParserV2();
  parser.setDebug(true);

  const initialized = await parser.initialize();
  if (!initialized) {
    console.log('❌ Could not initialize parser');
    return;
  }

  // Test sentences that showcase different Compromise features
  const testSentences = [
    "Dr. John Smith works at Harvard University in Boston.",
    "Microsoft announced a $100 billion investment on March 15, 2024.",
    "The quick brown fox jumps over the lazy dog.",
    "Einstein published his theory of relativity in 1905.",
    "Alice and Bob went to New York last Tuesday.",
    "The brilliant young scientist discovered an amazing new planet.",
    "NASA's Mars rover successfully landed yesterday."
  ];

  for (const sentence of testSentences) {
    const result = parser.processText(sentence);
    console.log('\n' + '═'.repeat(80));
  }

  console.log('\n✅ Enhanced parser demonstration complete!');
}

module.exports = {
  EnhancedCompromiseParserV2
};

if (require.main === module) {
  demonstrateEnhancedParserV2().catch(console.error);
}