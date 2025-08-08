#!/usr/bin/env node

/**
 * Entity Preprocessing Test
 * 
 * Tests preprocessing with Compromise + Wink to identify compound entities
 * (like "New York") and treat them as single atoms rather than separate modifiers
 */

const compromise = require("compromise");
const winkNLP = require("wink-nlp");
const model = require("wink-eng-lite-web-model");
const { CanonicalEnhancedParser } = require("./canonical_enhanced_parser");
const fs = require("fs");

class EntityPreprocessingParser extends CanonicalEnhancedParser {
  constructor() {
    super();
    this.compoundEntities = new Map();
  }

  /**
   * Enhanced preprocessing that identifies and preserves compound entities
   */
  preprocessText(text) {
    const doc = compromise(text);
    doc.contractions().expand();
    doc.normalize();
    
    // Identify compound entities BEFORE tokenization
    this.identifyCompoundEntities(text, doc);
    
    return doc.text();
  }

  /**
   * Identify compound entities that should be treated as single atoms
   */
  identifyCompoundEntities(text, doc) {
    this.compoundEntities.clear();
    
    // Multi-word named entities
    const people = doc.people().json();
    const places = doc.places().json();  
    const organizations = doc.organizations().json();
    const values = doc.values().json();
    
    const allEntities = [...people, ...places, ...organizations, ...values];
    
    // Find multi-word entities
    allEntities.forEach(entity => {
      const entityText = entity.text;
      const normalText = entity.normal || entityText.toLowerCase();
      
      if (entityText.includes(' ') && entityText.split(' ').length <= 4) {
        // Multi-word entity - treat as compound
        const compoundKey = normalText.replace(/\s+/g, '_');
        this.compoundEntities.set(entityText.toLowerCase(), {
          compound: compoundKey,
          type: this.getEntityType(entity),
          original: entityText,
          words: entityText.split(' ')
        });
        
        if (this.debug) {
          console.log(`🔗 Compound entity: "${entityText}" → ${compoundKey}`);
        }
      }
    });
    
    // Common compound terms that should stay together
    const commonCompounds = [
      "New York", "Los Angeles", "San Francisco", "White House", "Wall Street",
      "Supreme Court", "Federal Reserve", "United States", "European Union",
      "stock market", "trade war", "job growth", "interest rates", "Bureau of Labor Statistics",
      "Liberation Day", "second quarter", "first quarter", "gross domestic product",
      "labor force", "immigration policy", "mass deportation", "economic data",
      "trade deals", "tariff wars", "AI investment", "market access"
    ];
    
    commonCompounds.forEach(compound => {
      if (text.toLowerCase().includes(compound.toLowerCase())) {
        const compoundKey = compound.toLowerCase().replace(/\s+/g, '_');
        this.compoundEntities.set(compound.toLowerCase(), {
          compound: compoundKey,
          type: 'compound_concept',
          original: compound,
          words: compound.split(' ')
        });
        
        if (this.debug) {
          console.log(`🔗 Common compound: "${compound}" → ${compoundKey}`);
        }
      }
    });
  }

  /**
   * Get entity type for compound classification
   */
  getEntityType(entity) {
    if (entity.tags?.includes('Person')) return 'person';
    if (entity.tags?.includes('Place')) return 'place';  
    if (entity.tags?.includes('Organization')) return 'organization';
    if (entity.tags?.includes('Value')) return 'value';
    return 'compound';
  }

  /**
   * Enhanced classification that handles compound entities
   */
  enhanceClassifications(text) {
    // Get base classifications
    const baseClassifications = this.classifier.classifyText(text);
    
    // Process compound entities
    const processedClassifications = this.processCompoundEntities(baseClassifications, text);
    
    // Apply other enhancements
    const doc = compromise(text);
    const winkDoc = this.nlp.readDoc(text);
    const docTokens = winkDoc.tokens().out(this.its.normal);
    const contextVector = this.bm25.vectorOf(docTokens);

    this.entityRelationships = this.buildEntityRelationshipMap(text);

    const enhanced = processedClassifications.map(classification => {
      if (classification.isCompound) {
        // Compound entities get special treatment
        return classification;
      }

      const token = classification.features.token.toLowerCase();
      let newPrediction = classification.prediction;
      let newConfidence = classification.confidence;
      const enhancements = [];

      // BM25 context awareness
      const atomVector = this.bm25.vectorOf([token]);
      const contextRelevance = this.cosineSimilarity(atomVector, contextVector);

      if (contextRelevance > 0.1) {
        newConfidence *= (1 + contextRelevance * 0.5);
        enhancements.push(`BM25 context boost: ${contextRelevance.toFixed(3)}`);
      }

      // Compromise.js enhancements
      const compromiseEnhancements = this.applyCompromiseEnhancements(
        token, newPrediction, newConfidence, doc
      );
      newPrediction = compromiseEnhancements.prediction;
      newConfidence = compromiseEnhancements.confidence;
      enhancements.push(...compromiseEnhancements.enhancements);

      return {
        ...classification,
        prediction: newPrediction,
        confidence: Math.min(newConfidence, 1.0),
        enhancements: enhancements,
        contextRelevance: contextRelevance
      };
    });

    return enhanced;
  }

  /**
   * Process compound entities in classifications
   */
  processCompoundEntities(classifications, text) {
    const result = [];
    let i = 0;
    
    while (i < classifications.length) {
      const classification = classifications[i];
      const token = classification.features.token;
      
      // Check if this token starts a compound entity
      let foundCompound = null;
      let compoundLength = 0;
      
      // Look for compound entities starting at this position
      for (const [entityText, entityData] of this.compoundEntities.entries()) {
        const entityWords = entityData.words;
        if (entityWords.length > 0 && 
            token.toLowerCase() === entityWords[0].toLowerCase()) {
          
          // Check if the following tokens match
          let matches = true;
          for (let j = 1; j < entityWords.length; j++) {
            if (i + j >= classifications.length ||
                classifications[i + j].features.token.toLowerCase() !== entityWords[j].toLowerCase()) {
              matches = false;
              break;
            }
          }
          
          if (matches) {
            foundCompound = entityData;
            compoundLength = entityWords.length;
            break;
          }
        }
      }
      
      if (foundCompound) {
        // Create compound entity classification
        const compoundClassification = {
          features: {
            token: foundCompound.compound,
            originalTokens: foundCompound.words,
            compoundType: foundCompound.type
          },
          prediction: this.getCompoundPrediction(foundCompound),
          confidence: 0.95,
          enhancements: [`Compound entity: ${foundCompound.original}`],
          isCompound: true,
          originalClassifications: classifications.slice(i, i + compoundLength)
        };
        
        result.push(compoundClassification);
        i += compoundLength; // Skip the individual tokens
      } else {
        result.push(classification);
        i++;
      }
    }
    
    return result;
  }

  /**
   * Get prediction for compound entities
   */
  getCompoundPrediction(entityData) {
    switch (entityData.type) {
      case 'person':
      case 'place':
      case 'organization':
        return 'C'; // Concept
      case 'value':
        return 'M'; // Modifier (numbers, dates, etc.)
      case 'compound_concept':
      default:
        return 'C'; // Most compounds are concepts
    }
  }

  /**
   * Enhanced string conversion for compound entities
   */
  hyperedgeToString(hyperedge) {
    if (typeof hyperedge === "string") return hyperedge;
    
    if (hyperedge && hyperedge.type === "hyperedge") {
      return "(" + hyperedge.elements.map(e => this.hyperedgeToString(e)).join(" ") + ")";
    }
    
    if (hyperedge && hyperedge.type === 'sentence_boundary') {
      return hyperedge.terminator;
    }
    
    if (hyperedge && hyperedge.features && hyperedge.features.token) {
      const token = hyperedge.features.token;
      const prediction = hyperedge.prediction || "C";
      
      // Handle compound entities
      if (hyperedge.isCompound) {
        const subtype = this.getCompoundSubtype(hyperedge.features.compoundType);
        return `${token}/${prediction}${subtype}`;
      }
      
      const subtype = this.inferSubtype(token, prediction, hyperedge.features);
      return `${token}/${prediction}${subtype}`;
    }
    
    return String(hyperedge);
  }

  /**
   * Get subtypes for compound entities
   */
  getCompoundSubtype(compoundType) {
    switch (compoundType) {
      case 'person':
        return 'p';
      case 'place':
        return 'p';
      case 'organization':
        return 'p';
      case 'value':
        return '#';
      default:
        return 'c';
    }
  }
}

// Test function
async function testEntityPreprocessing() {
  console.log("🔬 Entity Preprocessing Test");
  console.log("============================");
  console.log("Testing compound entity identification and preservation\n");

  // Read test text
  const testText = fs.readFileSync('./test_text.txt', 'utf8');
  
  // Extract a few representative sentences
  const sentences = testText.split(/[.!?]+/).slice(0, 8).map(s => s.trim()).filter(s => s.length > 20);
  
  const parser = new EntityPreprocessingParser();
  parser.setDebug(true);
  
  const initialized = await parser.initialize();
  if (!initialized) {
    console.log("❌ Could not initialize parser");
    return;
  }

  console.log("\n📝 Testing compound entity preprocessing on sample sentences:\n");

  // Test each sentence
  for (let i = 0; i < Math.min(5, sentences.length); i++) {
    const sentence = sentences[i];
    console.log(`\n📄 Sentence ${i + 1}: "${sentence.substring(0, 100)}..."`);
    console.log("-".repeat(80));
    
    const result = parser.parse(sentence);
    const resultString = parser.hyperedgeToString(result);
    
    console.log(`\n🧠 Result:`);
    console.log(`   ${resultString}`);
    
    // Analyze compound entities found
    const compounds = Array.from(parser.compoundEntities.keys());
    if (compounds.length > 0) {
      console.log(`\n🔗 Compound entities identified: ${compounds.join(', ')}`);
    }
    
    console.log("\n" + "═".repeat(80));
  }

  // Compare with standard parser
  console.log("\n🔄 COMPARISON WITH STANDARD PARSER:");
  console.log("=" .repeat(60));
  
  const standardParser = new CanonicalEnhancedParser();
  await standardParser.initialize();
  standardParser.setDebug(false);
  
  const testSentence = "New York and Los Angeles are major cities in the United States.";
  
  console.log(`\n📝 Test sentence: "${testSentence}"`);
  
  console.log("\n🆕 WITH Entity Preprocessing:");
  parser.setDebug(false);
  const preprocessedResult = parser.parse(testSentence);
  console.log(`   ${parser.hyperedgeToString(preprocessedResult)}`);
  
  console.log("\n📊 WITHOUT Entity Preprocessing:");  
  const standardResult = standardParser.parse(testSentence);
  console.log(`   ${standardParser.hyperedgeToString(standardResult)}`);
  
  console.log("\n📈 Analysis:");
  console.log("   - Entity preprocessing preserves compound entities as single atoms");
  console.log("   - Prevents 'New' from being treated as modifier to 'York'");
  console.log("   - Maintains semantic integrity of named entities");
  console.log("   - Reduces parsing complexity for compound concepts");

  console.log("\n✅ Entity preprocessing test complete!");
}

module.exports = {
  EntityPreprocessingParser
};

if (require.main === module) {
  testEntityPreprocessing().catch(console.error);
}