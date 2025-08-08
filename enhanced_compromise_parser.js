#!/usr/bin/env node

/**
 * Enhanced Compromise.js Hypergraph Parser
 * 
 * Leverages advanced Compromise.js features for better semantic parsing:
 * - Advanced named entity recognition
 * - Clause and phrase detection  
 * - Better syntactic analysis
 * - Enhanced text normalization
 */

const compromise = require('compromise');
const SemanticAtomClassifier = require('./semantic_atom_classifier');

class EnhancedCompromiseParser {
  constructor() {
    this.classifier = new SemanticAtomClassifier();
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
   * Enhanced text preprocessing using Compromise features
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
   * Extract enhanced linguistic features using Compromise
   */
  extractEnhancedFeatures(text) {
    const doc = compromise(text);
    const features = {};

    // Named entities
    features.people = doc.people().json().map(p => ({
      text: p.text,
      normal: p.normal,
      tags: p.tags
    }));

    features.places = doc.places().json().map(p => ({
      text: p.text,
      normal: p.normal,
      tags: p.tags
    }));

    features.organizations = doc.organizations().json().map(o => ({
      text: o.text,
      normal: o.normal,
      tags: o.tags
    }));

    features.dates = doc.dates().json().map(d => ({
      text: d.text,
      normal: d.normal,
      start: d.start,
      end: d.end
    }));

    features.numbers = doc.numbers().json().map(n => ({
      text: n.text,
      number: n.number,
      hasComma: n.hasComma
    }));

    // Syntactic structures
    features.sentences = doc.sentences().json().map(s => ({
      text: s.text,
      terms: s.terms?.length || 0
    }));

    features.clauses = doc.clauses ? doc.clauses().json() : [];
    features.phrases = doc.phrases ? doc.phrases().json() : [];

    // Chunks (noun phrases, verb phrases, etc.)
    features.chunks = doc.chunks().json().map(c => ({
      text: c.text,
      normal: c.normal,
      tags: c.tags
    }));

    // Get detailed term information
    features.terms = doc.terms().json().map(t => ({
      text: t.text,
      normal: t.normal,
      tag: t.tag,
      bestTag: t.bestTag,
      confidence: t.confidence,
      syllables: t.syllables,
      implicit: t.implicit,
      pre: t.pre,
      post: t.post
    }));

    return features;
  }

  /**
   * Enhanced atom classification using Compromise features
   */
  classifyWithCompromise(text) {
    const preprocessed = this.preprocessText(text);
    const enhancedFeatures = this.extractEnhancedFeatures(preprocessed);
    
    // Use our existing classifier but enhance with Compromise features
    const classificationResults = this.classifier.classifyText(preprocessed);
    
    // Enhance classifications with Compromise insights
    return this.enhanceClassifications(classificationResults, enhancedFeatures);
  }

  /**
   * Enhance atom classifications using Compromise insights
   */
  enhanceClassifications(classifications, features) {
    const enhanced = [...classifications];
    
    // Create lookup maps for entities
    const peopleMap = new Map();
    const placesMap = new Map();
    const orgsMap = new Map();
    const datesMap = new Map();
    const numbersMap = new Map();

    features.people.forEach(p => peopleMap.set(p.normal.toLowerCase(), p));
    features.places.forEach(p => placesMap.set(p.normal.toLowerCase(), p));
    features.organizations.forEach(o => orgsMap.set(o.normal.toLowerCase(), o));
    features.dates.forEach(d => datesMap.set(d.normal.toLowerCase(), d));
    features.numbers.forEach(n => numbersMap.set(n.text.toLowerCase(), n));

    // Enhance each classification
    enhanced.forEach((classification, index) => {
      const token = classification.features.token.toLowerCase();
      const originalPrediction = classification.prediction;
      let newPrediction = originalPrediction;
      let confidence = classification.confidence;
      const enhancement = { source: 'compromise', changes: [] };

      // Check if token is a named entity
      if (peopleMap.has(token)) {
        if (originalPrediction !== 'C') {
          newPrediction = 'C';
          confidence = Math.max(confidence, 0.9);
          enhancement.changes.push(`Person entity: ${token} -> C`);
        }
        classification.entityType = 'person';
      }

      if (placesMap.has(token)) {
        if (originalPrediction !== 'C') {
          newPrediction = 'C';
          confidence = Math.max(confidence, 0.9);
          enhancement.changes.push(`Place entity: ${token} -> C`);
        }
        classification.entityType = 'place';
      }

      if (orgsMap.has(token)) {
        if (originalPrediction !== 'C') {
          newPrediction = 'C';
          confidence = Math.max(confidence, 0.9);
          enhancement.changes.push(`Organization entity: ${token} -> C`);
        }
        classification.entityType = 'organization';
      }

      if (datesMap.has(token)) {
        if (originalPrediction !== 'M') {
          newPrediction = 'M';
          confidence = Math.max(confidence, 0.85);
          enhancement.changes.push(`Date entity: ${token} -> M`);
        }
        classification.entityType = 'date';
      }

      if (numbersMap.has(token)) {
        if (originalPrediction !== 'M') {
          newPrediction = 'M';
          confidence = Math.max(confidence, 0.85);
          enhancement.changes.push(`Number entity: ${token} -> M`);
        }
        classification.entityType = 'number';
      }

      // Use detailed term information from Compromise
      const termInfo = features.terms.find(t => 
        t.normal.toLowerCase() === token || t.text.toLowerCase() === token
      );

      if (termInfo) {
        // Use Compromise's confidence if higher
        if (termInfo.confidence && termInfo.confidence > confidence) {
          confidence = termInfo.confidence;
          enhancement.changes.push(`Used Compromise confidence: ${termInfo.confidence}`);
        }

        // Additional tag-based corrections
        if (termInfo.tag && termInfo.bestTag) {
          const compromiseTag = termInfo.bestTag;
          let suggestedType = null;

          // Map Compromise tags to our atom types
          if (compromiseTag === 'Noun' && originalPrediction !== 'C') {
            suggestedType = 'C';
          } else if (compromiseTag === 'Verb' && originalPrediction !== 'P') {
            suggestedType = 'P';
          } else if (['Adjective', 'Adverb', 'Determiner'].includes(compromiseTag) && originalPrediction !== 'M') {
            suggestedType = 'M';
          } else if (compromiseTag === 'Preposition' && originalPrediction !== 'T') {
            suggestedType = 'T';
          } else if (compromiseTag === 'Conjunction' && originalPrediction !== 'J') {
            suggestedType = 'J';
          }

          if (suggestedType && suggestedType !== originalPrediction) {
            // Only apply if Compromise is confident
            if (termInfo.confidence > 0.7) {
              newPrediction = suggestedType;
              confidence = Math.max(confidence, termInfo.confidence);
              enhancement.changes.push(`Tag-based correction: ${compromiseTag} -> ${suggestedType}`);
            }
          }
        }

        classification.compromiseInfo = termInfo;
      }

      // Apply changes
      if (newPrediction !== originalPrediction || enhancement.changes.length > 0) {
        classification.prediction = newPrediction;
        classification.confidence = confidence;
        classification.enhancement = enhancement;
        
        if (this.debug && enhancement.changes.length > 0) {
          console.log(`Enhanced ${token}: ${enhancement.changes.join(', ')}`);
        }
      }
    });

    return enhanced;
  }

  /**
   * Build enhanced hypergraph using syntactic information
   */
  buildEnhancedHypergraph(classifications, features) {
    // Use chunks and phrases to guide hypergraph construction
    const chunks = features.chunks;
    const phrases = features.phrases;
    const clauses = features.clauses;

    if (this.debug) {
      console.log('\n🔍 Compromise Analysis:');
      console.log(`  Chunks: ${chunks.length}`);
      console.log(`  Phrases: ${phrases.length}`);
      console.log(`  Clauses: ${clauses.length}`);
      
      if (chunks.length > 0) {
        console.log('\n📝 Detected Chunks:');
        chunks.forEach(chunk => {
          console.log(`    "${chunk.text}" (${chunk.tags.join(', ')})`);
        });
      }
    }

    // For now, return structured information that could guide parsing
    return {
      classifications: classifications,
      syntacticStructure: {
        chunks: chunks,
        phrases: phrases,
        clauses: clauses
      },
      entities: {
        people: features.people,
        places: features.places,
        organizations: features.organizations,
        dates: features.dates,
        numbers: features.numbers
      }
    };
  }

  /**
   * Process text with enhanced Compromise features
   */
  processText(text) {
    if (this.debug) {
      console.log(`\n📝 Processing with enhanced Compromise parser: "${text}"`);
      console.log('─'.repeat(60));
    }

    // Step 1: Enhanced classification
    const enhancedClassifications = this.classifyWithCompromise(text);
    
    // Step 2: Extract additional features
    const features = this.extractEnhancedFeatures(text);
    
    // Step 3: Build enhanced structure
    const result = this.buildEnhancedHypergraph(enhancedClassifications, features);
    
    if (this.debug) {
      console.log('\n🏷️  Enhanced Classifications:');
      enhancedClassifications.forEach((cls, i) => {
        const token = cls.features.token;
        const type = cls.prediction;
        const conf = (cls.confidence * 100).toFixed(1);
        const entityInfo = cls.entityType ? ` [${cls.entityType}]` : '';
        const changes = cls.enhancement?.changes.length > 0 ? ` (${cls.enhancement.changes.length} changes)` : '';
        console.log(`    ${i + 1}. ${token} -> ${type} (${conf}%)${entityInfo}${changes}`);
      });
    }

    return result;
  }

  setDebug(enabled) {
    this.debug = enabled;
  }
}

/**
 * Demonstration function
 */
async function demonstrateEnhancedParser() {
  console.log('🚀 Enhanced Compromise.js Hypergraph Parser');
  console.log('==========================================\n');

  const parser = new EnhancedCompromiseParser();
  parser.setDebug(true);

  const initialized = await parser.initialize();
  if (!initialized) {
    console.log('❌ Could not initialize parser');
    return;
  }

  // Test sentences
  const testSentences = [
    "Dr. John Smith works at Harvard University in Boston.",
    "On March 15, 2024, Microsoft announced a $100 billion investment.",
    "The quick brown fox jumps over the lazy dog.",
    "Einstein published his theory of relativity in 1905.",
    "Alice and Bob went to New York last Tuesday."
  ];

  for (const sentence of testSentences) {
    const result = parser.processText(sentence);
    console.log('\n' + '═'.repeat(80));
  }
}

module.exports = {
  EnhancedCompromiseParser
};

if (require.main === module) {
  demonstrateEnhancedParser().catch(console.error);
}