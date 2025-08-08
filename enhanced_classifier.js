#!/usr/bin/env node

/**
 * Enhanced Semantic Hypergraph Atom Classifier with Compromise.js Integration
 *
 * This enhanced version combines:
 * - Wink.js for lightweight NLP and ML classification
 * - Compromise.js for richer linguistic analysis and feature extraction
 * - Multiple feature extraction strategies for improved accuracy
 */

const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");

// NLP libraries
const winkNLP = require("wink-nlp");
const model = require("wink-eng-lite-web-model");
const bayes = require("wink-naive-bayes-text-classifier");
const regressionTree = require("wink-regression-tree");

// Compromise.js for enhanced linguistic analysis
const nlp = require("compromise");

// Initialize WinkNLP
const wink = winkNLP(model);
const its = wink.its;

class EnhancedSemanticAtomClassifier {
  constructor() {
    // Initialize classifiers
    this.bayesClassifier = bayes();
    this.treeClassifier = regressionTree();
    this.compromiseClassifier = bayes(); // Additional classifier using compromise features

    // Ensemble weights
    this.ensembleWeights = {
      bayes: 0.4,
      tree: 0.3,
      compromise: 0.3,
    };

    // Training data storage
    this.trainingData = [];
    this.encodings = {};
    this.decodings = {};

    // Setup classifiers
    this.setupClassifiers();
  }

  setupClassifiers() {
    // Configure Wink Naive Bayes
    const prepTasks = [
      its.tokenize,
      its.removeElems,
      its.lowerCase,
      its.stem,
      its.negation,
      its.bag,
    ];
    this.bayesClassifier.definePrepTasks(prepTasks);

    // Configure Compromise-based classifier (uses same preprocessing)
    this.compromiseClassifier.definePrepTasks(prepTasks);

    // Configure Regression Tree
    this.treeConfig = {
      featureColumns: [
        { name: "pos_numeric", categorical: false },
        { name: "tag_numeric", categorical: false },
        { name: "dep_numeric", categorical: false },
        { name: "head_pos_numeric", categorical: false },
        { name: "head_dep_numeric", categorical: false },
        { name: "next_pos_numeric", categorical: false },
        { name: "is_root", categorical: true },
        { name: "has_lefts", categorical: true },
        { name: "has_rights", categorical: true },
        { name: "ent_type_numeric", categorical: false },
        { name: "token_length", categorical: false },
        { name: "shape_numeric", categorical: false },
        // Enhanced features from compromise
        { name: "compromise_pos_numeric", categorical: false },
        { name: "is_noun", categorical: true },
        { name: "is_verb", categorical: true },
        { name: "is_adjective", categorical: true },
        { name: "is_person", categorical: true },
        { name: "is_place", categorical: true },
        { name: "is_punctuation", categorical: true },
        { name: "sentence_position", categorical: false },
        { name: "syntactic_role", categorical: false },
      ],
      targetColumn: "atom_type_numeric",
    };
  }

  /**
   * Load training data with enhanced filtering
   */
  async loadTrainingData(csvPath) {
    return new Promise((resolve, reject) => {
      const data = [];

      fs.createReadStream(csvPath)
        .pipe(
          csv({
            separator: "\t",
            headers: [
              "type_flag",
              "token",
              "pos",
              "tag",
              "dep",
              "head_token",
              "head_pos",
              "head_tag",
              "head_dep",
              "is_root",
              "has_lefts",
              "has_rights",
              "ent_type",
              "shape",
              "prev_token",
              "next_token",
              "prev_punct",
              "next_punct",
              "prev_pos",
              "next_pos",
              "prev_tag",
              "next_tag",
              "prev_dep",
              "next_dep",
              "correct",
              "source",
            ],
          })
        )
        .on("data", (row) => {
          // Include ALL valid training examples including punctuation (X type)
          if (row.correct === "True" && row.type_flag.match(/[CMPTXJB]/)) {
            data.push(row);
          }
        })
        .on("end", () => {
          this.trainingData = data;
          console.log(`Loaded ${data.length} training examples`);
          resolve(data);
        })
        .on("error", reject);
    });
  }

  /**
   * Enhanced feature extraction using Compromise.js
   */
  extractCompromiseFeatures(token, context = "") {
    try {
      // Create a document with context for better analysis
      const fullText = context || token;
      const doc = nlp(fullText);

      // Find the specific token in the document
      let tokenMatch = doc.match(token);
      if (!tokenMatch.found) {
        // Fallback: analyze the token directly
        tokenMatch = nlp(token);
      }

      // Extract rich linguistic features
      const features = {
        // Basic POS information
        compromise_pos: this.getCompromisePOS(tokenMatch),

        // Semantic categories
        is_noun: tokenMatch.has("#Noun"),
        is_verb: tokenMatch.has("#Verb"),
        is_adjective: tokenMatch.has("#Adjective"),
        is_adverb: tokenMatch.has("#Adverb"),
        is_determiner: tokenMatch.has("#Determiner"),
        is_preposition: tokenMatch.has("#Preposition"),
        is_conjunction: tokenMatch.has("#Conjunction"),
        is_pronoun: tokenMatch.has("#Pronoun"),
        is_punctuation: tokenMatch.has("#Punctuation"),

        // Named entity recognition
        is_person: tokenMatch.people().found,
        is_place: tokenMatch.places().found,
        is_organization: tokenMatch.organizations().found,
        is_date: tokenMatch.dates().found,
        is_money: tokenMatch.money().found,

        // Morphological features
        is_plural: tokenMatch.has("#Plural"),
        is_singular: tokenMatch.has("#Singular"),
        is_past_tense: tokenMatch.has("#PastTense"),
        is_present_tense: tokenMatch.has("#PresentTense"),
        is_possessive: tokenMatch.has("#Possessive"),

        // Syntactic features
        is_subject: tokenMatch.has("#Subject"),
        is_object: tokenMatch.has("#Object"),

        // Token properties
        is_capitalized: /^[A-Z]/.test(token),
        is_all_caps: token === token.toUpperCase() && token.length > 1,
        is_title_case:
          token ===
          token.charAt(0).toUpperCase() + token.slice(1).toLowerCase(),

        // Length and shape
        token_length: token.length,
        is_single_char: token.length === 1,
        has_digits: /\d/.test(token),
        has_special_chars: /[^a-zA-Z0-9\s]/.test(token),
      };

      return features;
    } catch (error) {
      // Fallback features if compromise processing fails
      return {
        compromise_pos: "unknown",
        is_noun: false,
        is_verb: false,
        is_adjective: false,
        is_person: false,
        is_place: false,
        is_punctuation: /^[.,;:!?'"`()[\]{}'""-]+$/.test(token),
        token_length: token.length,
        is_single_char: token.length === 1,
      };
    }
  }

  /**
   * Get Compromise POS tag for a token
   */
  getCompromisePOS(tokenMatch) {
    const tags = tokenMatch.json()[0]?.terms?.[0]?.tags || [];
    return tags[0] || "Unknown";
  }

  /**
   * Create comprehensive feature encodings
   */
  createEncodings() {
    const uniqueValues = {
      pos: new Set(),
      tag: new Set(),
      dep: new Set(),
      head_pos: new Set(),
      head_dep: new Set(),
      next_pos: new Set(),
      ent_type: new Set(),
      shape: new Set(),
      type_flag: new Set(),
      compromise_pos: new Set(),
      syntactic_role: new Set(),
    };

    // Collect unique values from training data
    this.trainingData.forEach((row) => {
      // Original features
      uniqueValues.pos.add(row.pos);
      uniqueValues.tag.add(row.tag);
      uniqueValues.dep.add(row.dep);
      uniqueValues.head_pos.add(row.head_pos);
      uniqueValues.head_dep.add(row.head_dep);
      uniqueValues.next_pos.add(row.next_pos);
      uniqueValues.ent_type.add(row.ent_type || "");
      uniqueValues.shape.add(row.shape || "");
      uniqueValues.type_flag.add(row.type_flag);

      // Compromise features
      const compromiseFeatures = this.extractCompromiseFeatures(row.token);
      uniqueValues.compromise_pos.add(compromiseFeatures.compromise_pos);
    });

    // Create mappings
    this.encodings = {};
    Object.keys(uniqueValues).forEach((key) => {
      this.encodings[key] = {};
      Array.from(uniqueValues[key]).forEach((value, index) => {
        this.encodings[key][value] = index;
      });
    });

    // Create reverse mappings
    this.decodings = {};
    Object.keys(this.encodings).forEach((key) => {
      this.decodings[key] = {};
      Object.keys(this.encodings[key]).forEach((value) => {
        this.decodings[key][this.encodings[key][value]] = value;
      });
    });
  }

  /**
   * Enhanced Bayes features with compromise analysis
   */
  extractBayesFeatures(row) {
    const compromiseFeatures = this.extractCompromiseFeatures(row.token);

    const context = [
      row.prev_token || "",
      row.token,
      row.next_token || "",
      row.pos,
      row.tag,
      row.dep,
      row.head_pos,
      row.ent_type || "",
      // Compromise semantic features
      compromiseFeatures.compromise_pos,
      compromiseFeatures.is_punctuation ? "PUNCT" : "NOT_PUNCT",
      compromiseFeatures.is_person ? "PERSON" : "",
      compromiseFeatures.is_place ? "PLACE" : "",
      compromiseFeatures.is_noun ? "NOUN" : "",
      compromiseFeatures.is_verb ? "VERB" : "",
      compromiseFeatures.is_adjective ? "ADJ" : "",
    ]
      .filter((x) => x)
      .join(" ");

    return context;
  }

  /**
   * Enhanced tree features with compromise analysis
   */
  extractTreeFeatures(row) {
    const compromiseFeatures = this.extractCompromiseFeatures(row.token);

    return {
      // Original features
      pos_numeric: this.encodings.pos[row.pos] || 0,
      tag_numeric: this.encodings.tag[row.tag] || 0,
      dep_numeric: this.encodings.dep[row.dep] || 0,
      head_pos_numeric: this.encodings.head_pos[row.head_pos] || 0,
      head_dep_numeric: this.encodings.head_dep[row.head_dep] || 0,
      next_pos_numeric: this.encodings.next_pos[row.next_pos] || 0,
      is_root: row.is_root === "True",
      has_lefts: row.has_lefts === "True",
      has_rights: row.has_rights === "True",
      ent_type_numeric: this.encodings.ent_type[row.ent_type] || 0,
      token_length: row.token.length,
      shape_numeric: this.encodings.shape[row.shape] || 0,

      // Enhanced compromise features
      compromise_pos_numeric:
        this.encodings.compromise_pos[compromiseFeatures.compromise_pos] || 0,
      is_noun: compromiseFeatures.is_noun,
      is_verb: compromiseFeatures.is_verb,
      is_adjective: compromiseFeatures.is_adjective,
      is_person: compromiseFeatures.is_person,
      is_place: compromiseFeatures.is_place,
      is_punctuation: compromiseFeatures.is_punctuation,
      sentence_position: 0, // Simplified for now
      syntactic_role: 0, // Simplified for now

      // Target
      atom_type_numeric: this.encodings.type_flag[row.type_flag],
    };
  }

  /**
   * Extract Compromise-specific features for separate classifier
   */
  extractCompromiseOnlyFeatures(row) {
    const compromiseFeatures = this.extractCompromiseFeatures(row.token);

    const features = [
      row.token,
      compromiseFeatures.compromise_pos,
      compromiseFeatures.is_noun ? "NOUN" : "",
      compromiseFeatures.is_verb ? "VERB" : "",
      compromiseFeatures.is_adjective ? "ADJ" : "",
      compromiseFeatures.is_person ? "PERSON" : "",
      compromiseFeatures.is_place ? "PLACE" : "",
      compromiseFeatures.is_punctuation ? "PUNCT" : "",
      compromiseFeatures.is_capitalized ? "CAPITAL" : "",
      compromiseFeatures.has_digits ? "DIGITS" : "",
    ]
      .filter((x) => x)
      .join(" ");

    return features;
  }

  /**
   * Train all three classifiers
   */
  train() {
    console.log("Creating enhanced feature encodings...");
    this.createEncodings();

    console.log("Training Wink Naive Bayes classifier...");
    this.trainingData.forEach((row) => {
      const textFeatures = this.extractBayesFeatures(row);
      this.bayesClassifier.learn(textFeatures, row.type_flag);
    });
    this.bayesClassifier.consolidate();

    console.log("Training Compromise-based classifier...");
    this.trainingData.forEach((row) => {
      const compromiseFeatures = this.extractCompromiseOnlyFeatures(row);
      this.compromiseClassifier.learn(compromiseFeatures, row.type_flag);
    });
    this.compromiseClassifier.consolidate();

    console.log("Training Enhanced Regression Tree classifier...");
    const treeData = this.trainingData.map((row) =>
      this.extractTreeFeatures(row)
    );
    this.treeClassifier.ingestTrainingData(treeData, this.treeConfig);
    this.treeClassifier.learn();

    console.log("Training completed with enhanced features!");
    this.printTrainingStats();
  }

  /**
   * Enhanced text processing with both Wink and Compromise
   */
  processText(text) {
    const tokens = [];

    // Process with Compromise for rich analysis
    const doc = nlp(text);
    const compromiseTokens = doc.json()[0]?.terms || [];

    // Process with Wink for additional features
    const winkDoc = wink.readDoc(text);
    const winkTokens = winkDoc.tokens();

    // Combine features from both libraries
    compromiseTokens.forEach((cToken, index) => {
      const winkToken = winkTokens.itemAt(index);

      const features = {
        token: cToken.text,
        pos: winkToken ? winkToken.out(its.pos) : "Unknown",
        tag: winkToken ? winkToken.out(its.pos) : "Unknown",
        ent_type: winkToken ? winkToken.out(its.entityType) || "" : "",
        shape: this.getWordShape(cToken.text),
        token_length: cToken.text.length,

        // Enhanced features from compromise
        compromise_tags: cToken.tags || [],
        compromise_pos: cToken.tags?.[0] || "Unknown",

        // Context
        prev_token: index > 0 ? compromiseTokens[index - 1].text : "",
        next_token:
          index < compromiseTokens.length - 1
            ? compromiseTokens[index + 1].text
            : "",
      };

      tokens.push(features);
    });

    return tokens;
  }

  /**
   * Enhanced prediction using all three classifiers
   */
  predictToken(tokenFeatures) {
    // Wink Bayes prediction
    const bayesContext = this.extractBayesFeatures(tokenFeatures);
    const bayesResult = this.bayesClassifier.predict(bayesContext);

    // Compromise prediction
    const compromiseContext = this.extractCompromiseOnlyFeatures(tokenFeatures);
    const compromiseResult =
      this.compromiseClassifier.predict(compromiseContext);

    // Tree prediction (with available features)
    const treeFeatures = this.extractTreeFeatures(tokenFeatures);
    const treePrediction = this.treeClassifier.predict(treeFeatures);
    const treeResult =
      this.decodings.type_flag[Math.round(treePrediction)] || "C";

    // Enhanced ensemble prediction
    const bayesTop = bayesResult[0] || { label: "C", probability: 0 };
    const compromiseTop = compromiseResult[0] || { label: "C", probability: 0 };

    // Weighted ensemble decision
    const predictions = {
      bayes: { prediction: bayesTop.label, confidence: bayesTop.probability },
      compromise: {
        prediction: compromiseTop.label,
        confidence: compromiseTop.probability,
      },
      tree: { prediction: treeResult, confidence: 0.5 },
    };

    // Smart ensemble: use highest confidence if > threshold, otherwise weighted average
    let finalPrediction;
    const maxConfidence = Math.max(
      bayesTop.probability,
      compromiseTop.probability,
      0.5
    );

    if (maxConfidence > 0.8) {
      // Use highest confidence prediction
      if (bayesTop.probability === maxConfidence) {
        finalPrediction = bayesTop.label;
      } else if (compromiseTop.probability === maxConfidence) {
        finalPrediction = compromiseTop.label;
      } else {
        finalPrediction = treeResult;
      }
    } else {
      // Use weighted ensemble
      const weights = this.ensembleWeights;
      const weightedScore = {};

      [bayesTop.label, compromiseTop.label, treeResult].forEach((pred) => {
        if (!weightedScore[pred]) weightedScore[pred] = 0;
      });

      weightedScore[bayesTop.label] += weights.bayes * bayesTop.probability;
      weightedScore[compromiseTop.label] +=
        weights.compromise * compromiseTop.probability;
      weightedScore[treeResult] += weights.tree * 0.5;

      finalPrediction = Object.keys(weightedScore).reduce((a, b) =>
        weightedScore[a] > weightedScore[b] ? a : b
      );
    }

    return {
      prediction: finalPrediction,
      confidence: maxConfidence,
      details: predictions,
      features: tokenFeatures,
    };
  }

  /**
   * Enhanced text classification
   */
  classifyText(text) {
    console.log(`\nClassifying text with enhanced features: "${text}"`);
    console.log("=" + "=".repeat(60));

    const tokens = this.processText(text);
    const results = [];

    tokens.forEach((tokenFeatures, index) => {
      const prediction = this.predictToken(tokenFeatures);
      results.push(prediction);

      console.log(
        `${(index + 1).toString().padStart(2)}. ${tokenFeatures.token.padEnd(
          12
        )} -> ${prediction.prediction} (conf: ${(
          prediction.confidence * 100
        ).toFixed(1)}%) [B:${prediction.details.bayes.prediction} C:${
          prediction.details.compromise.prediction
        } T:${prediction.details.tree.prediction}]`
      );
    });

    return results;
  }

  /**
   * Print enhanced training statistics
   */
  printTrainingStats() {
    const typeDistribution = {};
    const compromiseStats = {};

    this.trainingData.forEach((row) => {
      typeDistribution[row.type_flag] =
        (typeDistribution[row.type_flag] || 0) + 1;

      // Analyze compromise features
      const cFeatures = this.extractCompromiseFeatures(row.token);
      const cPos = cFeatures.compromise_pos;

      if (!compromiseStats[cPos]) compromiseStats[cPos] = {};
      compromiseStats[cPos][row.type_flag] =
        (compromiseStats[cPos][row.type_flag] || 0) + 1;
    });

    console.log("\nEnhanced Training Data Distribution:");
    Object.entries(typeDistribution)
      .sort((a, b) => b[1] - a[1])
      .forEach(([type, count]) => {
        const percentage = ((count / this.trainingData.length) * 100).toFixed(
          1
        );
        console.log(`  ${type}: ${count} examples (${percentage}%)`);
      });

    console.log("\nTop Compromise POS -> Atom Type Mappings:");
    Object.entries(compromiseStats)
      .sort(
        (a, b) =>
          Object.values(b[1]).reduce((sum, x) => sum + x, 0) -
          Object.values(a[1]).reduce((sum, x) => sum + x, 0)
      )
      .slice(0, 10)
      .forEach(([pos, atomTypes]) => {
        const total = Object.values(atomTypes).reduce((sum, x) => sum + x, 0);
        const top = Object.entries(atomTypes).sort((a, b) => b[1] - a[1])[0];
        console.log(
          `  ${pos.padEnd(15)} -> ${top[0]} (${((top[1] / total) * 100).toFixed(
            1
          )}% of ${total})`
        );
      });
  }

  /**
   * Word shape helper
   */
  getWordShape(word) {
    return word
      .replace(/[A-Z]/g, "X")
      .replace(/[a-z]/g, "x")
      .replace(/[0-9]/g, "d")
      .replace(/[^Xxd]/g, ".");
  }

  /**
   * Save enhanced models
   */
  saveModels(directory) {
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }

    // Save all models
    fs.writeFileSync(
      path.join(directory, "bayes_model.json"),
      JSON.stringify(this.bayesClassifier.exportJSON(), null, 2)
    );
    fs.writeFileSync(
      path.join(directory, "compromise_model.json"),
      JSON.stringify(this.compromiseClassifier.exportJSON(), null, 2)
    );
    fs.writeFileSync(
      path.join(directory, "encodings.json"),
      JSON.stringify(this.encodings, null, 2)
    );
    fs.writeFileSync(
      path.join(directory, "ensemble_weights.json"),
      JSON.stringify(this.ensembleWeights, null, 2)
    );

    console.log(`Enhanced models saved to ${directory}/`);
  }

  /**
   * Load enhanced models
   */
  loadModels(directory) {
    // Load models
    const bayesModel = JSON.parse(
      fs.readFileSync(path.join(directory, "bayes_model.json"))
    );
    this.bayesClassifier.importJSON(bayesModel);

    const compromiseModel = JSON.parse(
      fs.readFileSync(path.join(directory, "compromise_model.json"))
    );
    this.compromiseClassifier.importJSON(compromiseModel);

    this.encodings = JSON.parse(
      fs.readFileSync(path.join(directory, "encodings.json"))
    );
    this.ensembleWeights = JSON.parse(
      fs.readFileSync(path.join(directory, "ensemble_weights.json"))
    );

    // Recreate decodings
    this.decodings = {};
    Object.keys(this.encodings).forEach((key) => {
      this.decodings[key] = {};
      Object.keys(this.encodings[key]).forEach((value) => {
        this.decodings[key][this.encodings[key][value]] = value;
      });
    });

    console.log(`Enhanced models loaded from ${directory}/`);
  }
}

// Main execution
async function main() {
  const classifier = new EnhancedSemanticAtomClassifier();

  const csvPath = path.join(
    __dirname,
    "graphbrain",
    "graphbrain",
    "data",
    "atoms-en.csv"
  );

  if (!fs.existsSync(csvPath)) {
    console.error(`Training data not found at: ${csvPath}`);
    process.exit(1);
  }

  try {
    await classifier.loadTrainingData(csvPath);
    classifier.train();
    classifier.saveModels("./enhanced_models");

    // Test enhanced classification
    const testSentences = [
      "John loves Mary deeply.",
      "The brilliant scientist discovered a remarkable planet.",
      "Alice and Bob quickly went to the old bookstore.",
      "Dr. Smith works at Harvard University in Boston.",
    ];

    testSentences.forEach((sentence) => {
      classifier.classifyText(sentence);
    });
  } catch (error) {
    console.error("Error:", error);
  }
}

// Helper functions
if (!String.prototype.repeat) {
  String.prototype.repeat = function (count) {
    return new Array(count + 1).join(this);
  };
}

if (!String.prototype.padEnd) {
  String.prototype.padEnd = function (targetLength, padString) {
    targetLength = targetLength >> 0;
    padString = String(padString || " ");
    if (this.length > targetLength) {
      return String(this);
    } else {
      targetLength = targetLength - this.length;
      if (targetLength > padString.length) {
        padString += padString.repeat(targetLength / padString.length);
      }
      return String(this) + padString.slice(0, targetLength);
    }
  };
}

if (!String.prototype.padStart) {
  String.prototype.padStart = function (targetLength, padString) {
    targetLength = targetLength >> 0;
    padString = String(padString || " ");
    if (this.length > targetLength) {
      return String(this);
    } else {
      targetLength = targetLength - this.length;
      if (targetLength > padString.length) {
        padString += padString.repeat(targetLength / padString.length);
      }
      return padString.slice(0, targetLength) + String(this);
    }
  };
}

if (require.main === module) {
  main();
}

module.exports = EnhancedSemanticAtomClassifier;
