#!/usr/bin/env node

/**
 * Semantic Hypergraph Atom Classifier using Wink.js
 *
 * This script trains classifiers using Graphbrain's atoms-en.csv training data
 * to assign semantic hypergraph atom types (C/M/P/T/X/J/B) to new text.
 *
 * Uses multiple Wink.js classifiers:
 * - Naive Bayes for text-based features
 * - Regression tree for structured linguistic features
 */

const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");

// Wink.js imports
const winkNLP = require("wink-nlp");
const model = require("wink-eng-lite-web-model");
const bayes = require("wink-naive-bayes-text-classifier");
const regressionTree = require("wink-regression-tree");
// Compromise.js for enhanced linguistic analysis
const cnlp = require("compromise");

// Initialize WinkNLP
// @ts-ignore – wink-nlp is a callable factory in CJS
const nlp = winkNLP(model);
const its = nlp.its;

class SemanticAtomClassifier {
  constructor() {
    // Initialize classifiers
    this.bayesClassifier = bayes();
    this.treeClassifier = regressionTree();
    // Additional Bayes classifier driven by Compromise features
    this.compromiseClassifier = bayes();
    this.ensembleWeights = { bayes: 0.4, tree: 0.3, compromise: 0.3 };

    // Option: include negative (incorrect) examples as label 'U' (unknown)
    this.includeNegatives =
      process.env.INCLUDE_NEGATIVES === "1" ||
      process.argv.includes("--include-negatives");

    // Training data storage
    this.trainingData = [];
    this.features = [];
    this.labels = [];

    // Configure Naive Bayes
    this.setupBayesClassifier();

    // Configure Regression Tree
    this.setupTreeClassifier();

    // Configure Compromise-based Bayes classifier
    this.setupCompromiseClassifier();
  }

  setupBayesClassifier() {
    // Configure preprocessing pipeline function
    const prepTask = (text) => {
      const tokens = [];
      nlp
        .readDoc(text)
        .tokens()
        // Use only words ignoring punctuations etc and from them remove stop words
        .filter((t) => t.out(its.type) === "word" && !t.out(its.stopWordFlag))
        // Handle negation and extract stem of the word
        .each((t) =>
          tokens.push(
            t.out(its.negationFlag) ? "!" + t.out(its.stem) : t.out(its.stem)
          )
        );

      return tokens;
    };

    this.bayesClassifier.definePrepTasks([prepTask]);

    // Configure behavior for better performance with semantic classification
    this.bayesClassifier.defineConfig({
      considerOnlyPresence: true,
      smoothingFactor: 0.5,
    });

    // Store for reuse in compromise classifier
    this._prepTask = prepTask;
  }

  setupCompromiseClassifier() {
    // Reuse the same preprocessing function and config
    if (this._prepTask)
      this.compromiseClassifier.definePrepTasks([this._prepTask]);
    this.compromiseClassifier.defineConfig({
      considerOnlyPresence: true,
      smoothingFactor: 0.5,
    });
  }

  setupTreeClassifier() {
    // Define feature columns for regression tree
    this.treeColumns = [
      { name: "pos", categorical: true, exclude: false },
      { name: "tag", categorical: true, exclude: false },
      { name: "dep", categorical: true, exclude: false },
      { name: "head_pos", categorical: true, exclude: false },
      { name: "head_dep", categorical: true, exclude: false },
      { name: "next_pos", categorical: true, exclude: false },
      { name: "is_root", categorical: true, exclude: false },
      { name: "has_lefts", categorical: true, exclude: false },
      { name: "has_rights", categorical: true, exclude: false },
      { name: "ent_type", categorical: true, exclude: false },
      { name: "token_length", categorical: false, exclude: false },
      { name: "shape", categorical: true, exclude: false },
      // Enhanced compromise-driven categorical features
      { name: "compromise_pos", categorical: true, exclude: false },
      { name: "is_noun", categorical: true, exclude: false },
      { name: "is_verb", categorical: true, exclude: false },
      { name: "is_adjective", categorical: true, exclude: false },
      { name: "is_person", categorical: true, exclude: false },
      { name: "is_place", categorical: true, exclude: false },
      { name: "is_punctuation", categorical: true, exclude: false },
      { name: "sentence_position", categorical: false, exclude: false },
      { name: "syntactic_role", categorical: true, exclude: false },
      { name: "atom_type_numeric", categorical: false, target: true },
    ];

    // Tree parameters for learning
    this.treeParams = {
      minPercentVarianceReduction: 0.5,
      minLeafNodeItems: 5,
      minSplitCandidateItems: 15,
      minAvgChildrenItems: 2,
    };
  }

  /**
   * Load and parse the atoms-en.csv training data
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
          // Positives: only correct labeled examples of known classes
          if (row.correct === "True" && row.type_flag.match(/[CMPTXJBU]/)) {
            data.push(row);
          } else if (this.includeNegatives) {
            // Negatives: treat incorrect examples as 'U' (unknown)
            data.push({ ...row, type_flag: "U", correct: "False" });
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
   * Create numerical encodings for categorical features
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
      // Enhanced sets
      compromise_pos: new Set(),
      syntactic_role: new Set(),
    };

    // Collect unique values
    this.trainingData.forEach((row) => {
      uniqueValues.pos.add(row.pos);
      uniqueValues.tag.add(row.tag);
      uniqueValues.dep.add(row.dep);
      uniqueValues.head_pos.add(row.head_pos);
      uniqueValues.head_dep.add(row.head_dep);
      uniqueValues.next_pos.add(row.next_pos);
      uniqueValues.ent_type.add(row.ent_type || "");
      uniqueValues.shape.add(row.shape || "");
      uniqueValues.type_flag.add(row.type_flag);

      // Compromise-driven
      const c = this.extractCompromiseFeatures(row.token);
      uniqueValues.compromise_pos.add(c.compromise_pos || "Unknown");
      uniqueValues.syntactic_role.add("0");
    });

    // Create mappings
    this.encodings = {};
    Object.keys(uniqueValues).forEach((key) => {
      this.encodings[key] = {};
      Array.from(uniqueValues[key]).forEach((value, index) => {
        this.encodings[key][value] = index;
      });
    });

    // Create reverse mappings for decoding
    this.decodings = {};
    const encs = this.encodings || {};
    Object.keys(encs).forEach((key) => {
      this.decodings[key] = {};
      const enc = encs[key] || {};
      Object.keys(enc).forEach((value) => {
        this.decodings[key][enc[value]] = value;
      });
    });
  }

  /**
   * Extract features for Naive Bayes (text-based approach)
   */
  extractBayesFeatures(row) {
    // Create contextual text representation
    const c = this.extractCompromiseFeatures(row.token);
    const context = [
      row.prev_token || "",
      row.token,
      row.next_token || "",
      row.pos,
      row.tag,
      row.dep,
      row.head_pos,
      row.ent_type || "",
      // compromise semantics
      c.compromise_pos,
      c.is_punctuation ? "PUNCT" : "",
      c.is_person ? "PERSON" : "",
      c.is_place ? "PLACE" : "",
      c.is_noun ? "NOUN" : "",
      c.is_verb ? "VERB" : "",
      c.is_adjective ? "ADJ" : "",
    ]
      .filter((x) => x)
      .join(" ");

    return context;
  }

  /**
   * Extract compromise-only context string for second Bayes classifier
   */
  extractCompromiseOnlyFeatures(rowOrToken) {
    const token =
      typeof rowOrToken === "string" ? rowOrToken : rowOrToken.token;
    const c = this.extractCompromiseFeatures(token);
    const features = [
      token,
      c.compromise_pos,
      c.is_noun ? "NOUN" : "",
      c.is_verb ? "VERB" : "",
      c.is_adjective ? "ADJ" : "",
      c.is_person ? "PERSON" : "",
      c.is_place ? "PLACE" : "",
      c.is_punctuation ? "PUNCT" : "",
      c.is_capitalized ? "CAPITAL" : "",
      c.has_digits ? "DIGITS" : "",
    ]
      .filter((x) => x)
      .join(" ");
    return features;
  }

  /**
   * Extract features for Regression Tree (structured approach)
   * Returns array in the same order as treeColumns
   */
  extractTreeFeatures(row) {
    const c = this.extractCompromiseFeatures(row.token);
    return [
      row.pos || "",
      row.tag || "",
      row.dep || "",
      row.head_pos || "",
      row.head_dep || "",
      row.next_pos || "",
      row.is_root || "False",
      row.has_lefts || "False",
      row.has_rights || "False",
      row.ent_type || "",
      row.token.length,
      row.shape || "",
      c.compromise_pos || "Unknown",
      c.is_noun ? "True" : "False",
      c.is_verb ? "True" : "False",
      c.is_adjective ? "True" : "False",
      c.is_person ? "True" : "False",
      c.is_place ? "True" : "False",
      c.is_punctuation ? "True" : "False",
      0,
      "0",
      this.encodings.type_flag[row.type_flag] || 0,
    ];
  }

  /**
   * Predict using a CSV row (mirrors training feature construction)
   */
  predictFromRow(row) {
    // Bayes context from row
    const bayesContext = this.extractBayesFeatures(row);
    const bayesLabel = this.bayesClassifier.predict(bayesContext) || null;

    // Compromise Bayes (optional)
    let compLabel = null;
    try {
      const compContext = this.extractCompromiseOnlyFeatures(row);
      compLabel = this.compromiseClassifier.predict(compContext) || null;
    } catch (_) {
      compLabel = null;
    }

    // Tree object for prediction
    const c = this.extractCompromiseFeatures(row.token);
    const treeFeatures = {
      pos: row.pos || "",
      tag: row.tag || "",
      dep: row.dep || "",
      head_pos: row.head_pos || "",
      head_dep: row.head_dep || "",
      next_pos: row.next_pos || "",
      is_root: row.is_root || "False",
      has_lefts: row.has_lefts || "False",
      has_rights: row.has_rights || "False",
      ent_type: row.ent_type || "",
      token_length: (row.token || "").length,
      shape: row.shape || "",
      compromise_pos: c.compromise_pos || "Unknown",
      is_noun: c.is_noun ? "True" : "False",
      is_verb: c.is_verb ? "True" : "False",
      is_adjective: c.is_adjective ? "True" : "False",
      is_person: c.is_person ? "True" : "False",
      is_place: c.is_place ? "True" : "False",
      is_punctuation: c.is_punctuation ? "True" : "False",
      sentence_position: 0,
      syntactic_role: "0",
    };
    const treePrediction = this.treeClassifier.predict(treeFeatures);
    const treeIndex = Math.round(Number(treePrediction) || 0);
    const treeDecoded =
      this.decodings && this.decodings.type_flag
        ? this.decodings.type_flag[treeIndex]
        : undefined;
    const treeLabel = treeDecoded || "C";

    // Ensemble voting
    const scores = Object.create(null);
    const addVote = (label, weight) => {
      if (!label) return;
      scores[label] = (scores[label] || 0) + weight;
    };
    addVote(bayesLabel, this.ensembleWeights.bayes);
    addVote(treeLabel, this.ensembleWeights.tree);
    addVote(compLabel, this.ensembleWeights.compromise);

    const labels = Object.keys(scores);
    let finalPrediction = treeLabel;
    let bestScore = -Infinity;
    for (const label of labels) {
      const sc = scores[label];
      if (sc > bestScore) {
        bestScore = sc;
        finalPrediction = label;
      }
    }
    const agreeCount = [bayesLabel, compLabel, treeLabel].filter(
      (x) => x === finalPrediction
    ).length;
    const confidence = agreeCount === 3 ? 0.9 : agreeCount === 2 ? 0.8 : 0.6;

    return {
      prediction: finalPrediction,
      confidence,
      bayes: bayesLabel,
      compromise: compLabel,
      tree: treeLabel,
    };
  }

  /**
   * Evaluate on a CSV file (same schema as training data)
   */
  async evaluateOnCSV(csvPath) {
    return new Promise((resolve, reject) => {
      const rows = [];
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
          // Keep known labels (and U if present)
          if ((row.type_flag || "").match(/^[CMPTXJBU]$/)) rows.push(row);
        })
        .on("end", () => {
          // Compute metrics
          const labels = new Set(rows.map((r) => r.type_flag));
          const confusion = {};
          const perLabel = {};
          let correct = 0;
          rows.forEach((r) => {
            const gold = r.type_flag;
            const pred = this.predictFromRow(r).prediction;
            if (!confusion[gold]) confusion[gold] = {};
            confusion[gold][pred] = (confusion[gold][pred] || 0) + 1;
            perLabel[gold] = perLabel[gold] || { gold: 0, correct: 0 };
            perLabel[gold].gold += 1;
            if (gold === pred) {
              perLabel[gold].correct += 1;
              correct += 1;
            }
          });
          const overall = rows.length ? correct / rows.length : 0;
          console.log("\nEvaluation on:", csvPath);
          console.log(
            `Overall accuracy: ${(overall * 100).toFixed(2)}% (${correct}/${
              rows.length
            })`
          );
          Array.from(labels)
            .sort()
            .forEach((l) => {
              const stats = perLabel[l] || { gold: 0, correct: 0 };
              const acc = stats.gold ? stats.correct / stats.gold : 0;
              console.log(
                `  ${l}: ${(acc * 100).toFixed(1)}% (${stats.correct}/${
                  stats.gold
                })`
              );
            });
          resolve({ overall, confusion, perLabel });
        })
        .on("error", reject);
    });
  }

  /**
   * Train both classifiers
   */
  train() {
    console.log("Creating feature encodings...");
    this.createEncodings();

    console.log("Training Naive Bayes classifier...");
    // Train Naive Bayes
    this.trainingData.forEach((row) => {
      const textFeatures = this.extractBayesFeatures(row);
      this.bayesClassifier.learn(textFeatures, row.type_flag);
    });
    this.bayesClassifier.consolidate();

    console.log("Training Regression Tree classifier...");

    // Configure the regression tree
    this.treeClassifier.defineConfig(this.treeColumns, this.treeParams);

    // Ingest training data
    this.trainingData.forEach((row) => {
      const treeFeatures = this.extractTreeFeatures(row);
      this.treeClassifier.ingest(treeFeatures);
    });

    // Train regression tree
    const rulesLearned = this.treeClassifier.learn();
    console.log(`Regression tree learned ${rulesLearned} rules`);

    console.log("Training completed!");

    // Print training statistics
    this.printTrainingStats();
  }

  /**
   * Print training statistics
   */
  printTrainingStats() {
    const typeDistribution = {};
    this.trainingData.forEach((row) => {
      typeDistribution[row.type_flag] =
        (typeDistribution[row.type_flag] || 0) + 1;
    });

    console.log("\nTraining Data Distribution:");
    Object.entries(typeDistribution)
      .sort((a, b) => b[1] - a[1])
      .forEach(([type, count]) => {
        const percentage = ((count / this.trainingData.length) * 100).toFixed(
          1
        );
        console.log(`  ${type}: ${count} examples (${percentage}%)`);
      });
  }

  /**
   * Process new text with WinkNLP to extract features
   */
  processText(text) {
    const doc = nlp.readDoc(text);
    const tokens = [];

    doc.tokens().each((token, index) => {
      const prevToken = index > 0 ? doc.tokens().itemAt(index - 1) : null;
      const nextToken =
        index < doc.tokens().length() - 1
          ? doc.tokens().itemAt(index + 1)
          : null;

      // Extract features similar to training data
      const features = {
        token: token.out(its.normal),
        pos: token.out(its.pos),
        tag: token.out(its.pos), // WinkNLP uses universal POS tags
        // Note: WinkNLP doesn't provide dependency parsing like spaCy
        // We'll use simplified features
        prev_token: prevToken ? prevToken.out(its.normal) : "",
        next_token: nextToken ? nextToken.out(its.normal) : "",
        ent_type: token.out(its.entityType) || "",
        shape: this.getWordShape(token.out(its.normal)),
        token_length: token.out(its.normal).length,
      };

      tokens.push(features);
    });

    return tokens;
  }

  /**
   * Generate word shape pattern (similar to spaCy)
   */
  getWordShape(word) {
    return word
      .replace(/[A-Z]/g, "X")
      .replace(/[a-z]/g, "x")
      .replace(/[0-9]/g, "d")
      .replace(/[^Xxd]/g, ".");
  }

  /**
   * Predict semantic atom type for processed token features
   */
  predictToken(tokenFeatures) {
    // Naive Bayes prediction
    const bayesContext = [
      tokenFeatures.prev_token,
      tokenFeatures.token,
      tokenFeatures.next_token,
      tokenFeatures.pos,
      tokenFeatures.ent_type,
    ]
      .filter((x) => x)
      .join(" ");

    const bayesResult = this.bayesClassifier.predict(bayesContext);

    // Compromise Bayes prediction
    let compromiseResult = null;
    try {
      const compContext = this.extractCompromiseOnlyFeatures(tokenFeatures);
      compromiseResult = this.compromiseClassifier.predict(compContext);
    } catch (_) {
      compromiseResult = null;
    }

    // Regression tree prediction (with available features)
    const c = this.extractCompromiseFeatures(tokenFeatures.token);
    const treeFeatures = {
      pos: tokenFeatures.pos || "", // pos (categorical)
      tag: tokenFeatures.tag || "", // tag (categorical)
      dep: "", // dep (not available from WinkNLP)
      head_pos: "", // head_pos (not available from WinkNLP)
      head_dep: "", // head_dep (not available from WinkNLP)
      next_pos: tokenFeatures.next_pos || "", // next_pos (categorical)
      is_root: "False", // is_root (simplified)
      has_lefts: "False", // has_lefts (simplified)
      has_rights: "False", // has_rights (simplified)
      ent_type: tokenFeatures.ent_type || "", // ent_type (categorical)
      token_length: tokenFeatures.token_length, // token_length (numerical)
      shape: tokenFeatures.shape || "", // shape (categorical)
      // Enhanced compromise-derived fields (must match training types)
      compromise_pos: c.compromise_pos || "Unknown",
      is_noun: c.is_noun ? "True" : "False",
      is_verb: c.is_verb ? "True" : "False",
      is_adjective: c.is_adjective ? "True" : "False",
      is_person: c.is_person ? "True" : "False",
      is_place: c.is_place ? "True" : "False",
      is_punctuation: c.is_punctuation ? "True" : "False",
      sentence_position: 0,
      syntactic_role: "0",
    };

    const treePrediction = this.treeClassifier.predict(treeFeatures);
    const treeIndex = Math.round(Number(treePrediction) || 0);
    const treeDecoded =
      this.decodings && this.decodings.type_flag
        ? this.decodings.type_flag[treeIndex]
        : undefined;
    const treeResult = treeDecoded || "C";

    // Ensemble voting with weights
    const bayesLabel = bayesResult || null;
    const compLabel = compromiseResult || null;
    const scores = Object.create(null);
    const addVote = (label, weight) => {
      if (!label) return;
      scores[label] = (scores[label] || 0) + weight;
    };
    addVote(bayesLabel, this.ensembleWeights.bayes);
    addVote(treeResult, this.ensembleWeights.tree);
    addVote(compLabel, this.ensembleWeights.compromise);

    const labels = Object.keys(scores);
    let finalPrediction = treeResult;
    let bestScore = -Infinity;
    for (const label of labels) {
      const sc = scores[label];
      if (sc > bestScore) {
        bestScore = sc;
        finalPrediction = label;
      }
    }

    const agreeCount = [bayesLabel, compLabel, treeResult].filter(
      (x) => x === finalPrediction
    ).length;
    const confidence = agreeCount === 3 ? 0.9 : agreeCount === 2 ? 0.8 : 0.6;

    return {
      prediction: finalPrediction,
      confidence: confidence,
      bayes: bayesLabel,
      compromise: compLabel,
      tree: treeResult,
      features: tokenFeatures,
    };
  }

  /**
   * Compromise-driven feature extractor for a token and optional context
   */
  extractCompromiseFeatures(token, context = "") {
    try {
      const fullText = context || token;
      const doc = cnlp(fullText);
      let match = doc.match(token);
      if (!match.found) match = cnlp(token);

      const tags = match.json()[0]?.terms?.[0]?.tags || [];
      // Note: compromise community plugins add helpers like people()/places().
      // Use tag heuristics for portability without plugins.
      return {
        compromise_pos: tags[0] || "Unknown",
        is_noun: match.has("#Noun"),
        is_verb: match.has("#Verb"),
        is_adjective: match.has("#Adjective"),
        is_adverb: match.has("#Adverb"),
        is_determiner: match.has("#Determiner"),
        is_preposition: match.has("#Preposition"),
        is_conjunction: match.has("#Conjunction"),
        is_pronoun: match.has("#Pronoun"),
        is_punctuation: match.has("#Punctuation"),
        is_person: match.has("#Person"),
        is_place: match.has("#Place"),
        is_organization: match.has("#Organization"),
        is_date: match.has("#Date"),
        is_money: match.has("#Money"),
        is_plural: match.has("#Plural"),
        is_singular: match.has("#Singular"),
        is_past_tense: match.has("#PastTense"),
        is_present_tense: match.has("#PresentTense"),
        is_possessive: match.has("#Possessive"),
        is_subject: match.has("#Subject"),
        is_object: match.has("#Object"),
        is_capitalized: /^[A-Z]/.test(token),
        is_all_caps: token === token.toUpperCase() && token.length > 1,
        is_title_case:
          token ===
          token.charAt(0).toUpperCase() + token.slice(1).toLowerCase(),
        token_length: token.length,
        is_single_char: token.length === 1,
        has_digits: /\d/.test(token),
        has_special_chars: /[^a-zA-Z0-9\s]/.test(token),
      };
    } catch (err) {
      return {
        compromise_pos: "Unknown",
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
   * Process complete text and assign semantic atom types
   */
  classifyText(text) {
    console.log(`\nClassifying text: "${text}"`);
    console.log("=".repeat(50));

    const tokens = this.processText(text);
    const results = [];

    tokens.forEach((tokenFeatures, index) => {
      const prediction = this.predictToken(tokenFeatures);
      results.push(prediction);

      console.log(
        `${index + 1}. ${tokenFeatures.token} -> ${
          prediction.prediction
        } (conf: ${(prediction.confidence * 100).toFixed(1)}%)`
      );
    });

    return results;
  }

  /**
   * Save trained models to files
   */
  saveModels(directory) {
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }

    // Save Naive Bayes model
    const bayesModel = this.bayesClassifier.exportJSON();
    fs.writeFileSync(
      path.join(directory, "bayes_model.json"),
      JSON.stringify(bayesModel, null, 2)
    );

    // Save encodings
    fs.writeFileSync(
      path.join(directory, "encodings.json"),
      JSON.stringify(this.encodings, null, 2)
    );

    console.log(`Models saved to ${directory}/`);
  }

  /**
   * Load trained models from files
   */
  loadModels(directory) {
    // Load Naive Bayes model
    const bayesModel = JSON.parse(
      fs.readFileSync(path.join(directory, "bayes_model.json"), "utf8")
    );
    this.bayesClassifier.importJSON(bayesModel);

    // Load encodings
    this.encodings = JSON.parse(
      fs.readFileSync(path.join(directory, "encodings.json"), "utf8")
    );

    // Recreate decodings
    this.decodings = {};
    Object.keys(this.encodings).forEach((key) => {
      this.decodings[key] = {};
      Object.keys(this.encodings[key]).forEach((value) => {
        this.decodings[key][this.encodings[key][value]] = value;
      });
    });

    console.log(`Models loaded from ${directory}/`);
  }
}

// Main execution
async function main() {
  const classifier = new SemanticAtomClassifier();

  // Prefer train/test split under data/ if available
  const trainPath = path.join(__dirname, "data", "atoms-train.csv");
  const testPath = path.join(__dirname, "data", "atoms-test.csv");
  const legacyPath = path.join(__dirname, "atoms-en.csv");

  try {
    if (fs.existsSync(trainPath)) {
      console.log(`Using training split: ${trainPath}`);
      await classifier.loadTrainingData(trainPath);
      classifier.train();
      classifier.saveModels("./models");
      if (fs.existsSync(testPath)) {
        await classifier.evaluateOnCSV(testPath);
      } else {
        console.warn(
          `Test split not found at ${testPath}; skipping evaluation.`
        );
      }
    } else if (fs.existsSync(legacyPath)) {
      console.log(`Using legacy training data: ${legacyPath}`);
      await classifier.loadTrainingData(legacyPath);
      classifier.train();
      classifier.saveModels("./models");
    } else {
      console.error(
        "No training data found. Expected either data/atoms-train.csv or atoms-en.csv"
      );
      process.exit(1);
    }

    // Optional quick demo
    const demoSentences = [
      "Ptolemy Ceraunus claimed the Macedonian throne.",
      "John likes eating pizza.",
    ];
    demoSentences.forEach((s) => classifier.classifyText(s));
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

// Helper function for string repetition
String.prototype.repeat = function (count) {
  return new Array(count + 1).join(this);
};

// Helper function for string padding
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

// Run the main function if this script is executed directly
if (require.main === module) {
  main();
}

module.exports = SemanticAtomClassifier;
