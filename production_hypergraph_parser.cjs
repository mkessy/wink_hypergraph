#!/usr/bin/env node

/**
 * Production-Ready Semantic Hypergraph Parser
 *
 * Clean API with comprehensive entity preprocessing and typed output data structures
 */

const compromise = require("compromise");
const winkNLP = require("wink-nlp");
const model = require("wink-eng-lite-web-model");
const BM25Vectorizer = require("wink-nlp/utilities/bm25-vectorizer");
const similarity = require("wink-nlp/utilities/similarity");
const SemanticAtomClassifier = require("./semantic_atom_classifier.cjs");
/*
similarity.bow.cosine(bowA, bowB)	Measures similarity between the two BoWs using cosine similarity.
similarity.set.tversky(setA, setB[, alpha, beta])	Measures similarity between the two sets using Tversky method. The default values for both alpha & beta is 0.5. You can get Jaccard similarity or Sørensen-Dice by using appropriate values for alpha & beta.
similarity.set.oo(setA, setB)	Measures Otsuka-Ochiai similarity between the two sets; this is equivalent to cosine similarity with a binarized BoW.
*/

/**
 * @typedef {Object} AtomClassification
 * @property {string} token - The token text
 * @property {string} prediction - Predicted type (C/M/P/T/B/J/X)
 * @property {number} confidence - Classification confidence (0-1)
 * @property {string[]} enhancements - Applied enhancements
 * @property {number} contextRelevance - BM25 context relevance score
 * @property {boolean} isCompound - Whether this is a compound entity
 * @property {string[]} originalTokens - Original tokens if compound
 */

/**
 * @typedef {Object} DetectedEntity
 * @property {string} text - Original entity text
 * @property {string} compound - Compound identifier (underscored)
 * @property {string} type - Entity type (person/place/organization/compound)
 * @property {string[]} words - Component words
 * @property {number} startPosition - Start position in text
 * @property {number} endPosition - End position in text
 */

/**
 * @typedef {Object} HypergraphEdge
 * @property {string} type - Edge type ('hyperedge' | 'atom' | 'sentence_boundary')
 * @property {(string|HypergraphEdge)[]} elements - Edge elements
 * @property {string} [punctuationType] - Type of punctuation structure
 */

/**
 * @typedef {Object} ParsingMetrics
 * @property {number} totalTokens - Total tokens processed
 * @property {number} compoundEntities - Number of compound entities detected
 * @property {number} parsingIterations - Number of parsing iterations
 * @property {number} averageConfidence - Average classification confidence
 * @property {number} semanticCoherenceScore - Overall semantic coherence
 * @property {number} processingTimeMs - Processing time in milliseconds
 */

/**
 * @typedef {Object} ParsingResult
 * @property {string} originalText - Input text
 * @property {string} preprocessedText - Processed text
 * @property {AtomClassification[]} atoms - Classified atoms
 * @property {DetectedEntity[]} entities - Detected compound entities
 * @property {HypergraphEdge} hypergraph - Parsed hypergraph structure
 * @property {string} hypergraphString - String representation
 * @property {ParsingMetrics} metrics - Parsing statistics
 * @property {Object} metadata - Additional metadata
 */

class ProductionHypergraphParser {
  constructor(options = {}) {
    // @ts-ignore – wink-nlp is a callable factory in CJS
    this.nlp = winkNLP(model);
    this.its = this.nlp.its;
    this.classifier = new SemanticAtomClassifier();
    this.debug = options.debug || false;
    const defaultBm25 = {
      k1: 1.2,
      b: 0.75,
      k: 1,
      norm: "l2",
      contextThreshold: 0.1,
      relationshipThreshold: 0.2,
      coherenceWeight: 500000,
      minDocTokens: 30,
    };
    const mergedBm25 = { ...defaultBm25, ...(options.bm25 || {}) };
    this.options = {
      enableBM25: options.enableBM25 !== false,
      enableEntityPreprocessing: options.enableEntityPreprocessing === true,
      enablePunctuationHandling: options.enablePunctuationHandling !== false,
      maxIterations: options.maxIterations || 50,
      largeTextTokenThreshold: options.largeTextTokenThreshold || 400,
      entityPreprocessing: {
        enabled: options.entityPreprocessing?.enabled === true,
        autoDetect: options.entityPreprocessing?.autoDetect === true,
        compoundList: [], // e.g., ["New York", "White House"]
        compoundMap: {}, // e.g., { "Supreme Court": "organization" }
        maxCompoundWords: 4,
        minFrequency: 2, // require at least this many occurrences if not a named entity
        allowFunctionWords: ["of"], // permitted inner function words in compounds
        ...(options.entityPreprocessing || {}),
      },
      ...options,
      bm25: {
        coherenceMode: options.bm25?.coherenceMode || "adjacent", // "adjacent" | "all"
        maxCoherenceWindow: options.bm25?.maxCoherenceWindow || 10,
        vectorizer: options.bm25?.vectorizer || null,
        ...mergedBm25,
      },
    };
    // Initialize external BM25 vectorizer if provided
    this.bm25 = this.options.bm25?.vectorizer || null;

    // Enhanced grammar rules with correct priorities
    this.rules = [
      {
        type: "C",
        allowedTypes: ["C"],
        size: 2,
        connector: "+/B/.",
        priority: 0,
      },
      {
        type: "M",
        allowedTypes: ["C", "R", "M", "S", "T", "P", "B", "J"],
        size: 2,
        priority: 1,
      },
      { type: "B", allowedTypes: ["C", "R"], size: 3, priority: 2 },
      { type: "T", allowedTypes: ["C", "R"], size: 2, priority: 3 },
      { type: "P", allowedTypes: ["C", "R", "S"], size: 6, priority: 4 },
      { type: "P", allowedTypes: ["C", "R", "S"], size: 5, priority: 5 },
      { type: "P", allowedTypes: ["C", "R", "S"], size: 4, priority: 6 },
      { type: "P", allowedTypes: ["C", "R", "S"], size: 3, priority: 7 },
      { type: "P", allowedTypes: ["C", "R", "S"], size: 2, priority: 8 },
      {
        type: "J",
        allowedTypes: ["C", "R", "M", "S", "T", "P", "B", "J"],
        size: 3,
        priority: 9,
      },
      {
        type: "J",
        allowedTypes: ["C", "R", "M", "S", "T", "P", "B", "J"],
        size: 2,
        priority: 10,
      },
    ];

    // No static BM25 training corpus; BM25 is built dynamically per input text

    // State
    this.compoundEntities = new Map();
    this.entityRelationships = new Map();
    this.initialized = false;
    // Per-parse cache for BM25 vectors
    this._vectorCache = new Map();
  }

  /**
   * Initialize the parser with all required models
   * @returns {Promise<boolean>} Success status
   */
  async initialize() {
    try {
      // Load classifier models
      this.classifier.loadModels("./models");

      if (this.options.enableBM25 && !this.bm25) {
        this.initializeBM25();
      }

      this.initialized = true;
      return true;
    } catch (error) {
      throw new Error(`Parser initialization failed: ${error.message}`);
    }
  }

  /**
   * Initialize BM25 vectorizer
   * @private
   */
  initializeBM25() {
    // Intentionally left blank; BM25 is built dynamically per text via buildBM25FromText()
  }

  /**
   * Build BM25 vectorizer from the input text by treating sentences as documents
   * @param {string} text
   * @private
   */
  buildBM25FromText(text) {
    const { k1, b, k, norm, minDocTokens, vectorizer } =
      this.options.bm25 || {};
    if (vectorizer) {
      this.bm25 = vectorizer;
      return;
    }
    const winkDoc = this.nlp.readDoc(text);
    const allTokens = winkDoc.tokens().out(this.its.normal);
    if (!allTokens || allTokens.length < (minDocTokens || 30)) {
      this.bm25 = null;
      return;
    }
    // @ts-ignore – wink bm25 vectorizer is callable in CJS
    const bm25 = BM25Vectorizer({ k1, b, k, norm });
    // Segment by sentences using compromise
    const cmp = compromise(text);
    const sentences = cmp.sentences().out("array");
    if (Array.isArray(sentences) && sentences.length > 0) {
      for (const s of sentences) {
        const sDoc = this.nlp.readDoc(s);
        const sTokens = sDoc.tokens().out(this.its.normal);
        if (sTokens && sTokens.length > 0) bm25.learn(sTokens);
      }
    } else {
      // Fallback: learn from entire document as one doc
      bm25.learn(allTokens);
    }
    this.bm25 = bm25;
  }

  /**
   * Parse text into semantic hypergraph with comprehensive output
   * @param {string} text - Input text to parse
   * @returns {Promise<ParsingResult>} Complete parsing result
   */
  async parse(text) {
    if (!this.initialized) {
      throw new Error("Parser must be initialized before use");
    }

    const startTime = Date.now();
    // reset per-parse caches
    this._vectorCache = new Map();
    // Build BM25 per input text if enabled and text is large enough
    if (this.options.enableBM25) {
      this.buildBM25FromText(text);
    }

    try {
      // Expect a single sentence by default; caller should pass one sentence at a time
      const preprocessed = this.preprocessText(text);
      const detectedEntities = this.detectEntities(text, preprocessed);
      const atoms = this.classifyAtoms(preprocessed);
      const hypergraph = this.buildHypergraph(atoms, preprocessed);
      const metrics = this.calculateMetrics(atoms, hypergraph, startTime);
      const postprocessedHypergraph = this.postProcess(hypergraph);

      return {
        originalText: text,
        preprocessedText: preprocessed,
        atoms: atoms,
        entities: detectedEntities,
        hypergraph: postprocessedHypergraph,
        hypergraphString: this.hypergraphToString(postprocessedHypergraph),
        metrics: metrics,
        metadata: {
          parserVersion: "1.0.0",
          timestamp: new Date().toISOString(),
          options: this.options,
          rulesApplied: metrics.parsingIterations,
        },
      };
    } catch (error) {
      throw new Error(`Parsing failed: ${error.message}`);
    }
  }

  // parseBySentences was intentionally removed; callers should process sentences independently

  postProcess(edge) {
    if (!edge || edge.atom || !edge.elements) {
      return edge;
    }

    let newEdge = this.fixArgRoles(edge);
    newEdge = this.processColonConjunctions(newEdge);

    return newEdge;
  }

  fixArgRoles(edge) {
    if (!edge || edge.atom || !edge.elements) {
      return edge;
    }

    const newElements = edge.elements.map((e) => this.fixArgRoles(e));
    const newEdge = { ...edge, elements: newElements };

    const argRoles = this.getArgRoles(newEdge);
    if (
      argRoles !== "" &&
      newEdge.type === "hyperedge" &&
      newEdge.elements[0].prediction === "P"
    ) {
      let newArgRoles = "";
      for (let i = 0; i < argRoles.length; i++) {
        const role = argRoles[i];
        const subEdge = newEdge.elements[i + 1];
        if (role === "?") {
          if (
            subEdge.type === "hyperedge" &&
            subEdge.elements[0].prediction === "P"
          ) {
            newArgRoles += "r";
          } else if (
            subEdge.type === "hyperedge" &&
            subEdge.elements[0].prediction === "T"
          ) {
            newArgRoles += "x";
          } else {
            newArgRoles += "?";
          }
        } else {
          newArgRoles += role;
        }
      }
      return this.replaceArgRoles(newEdge, newArgRoles);
    }

    return newEdge;
  }

  getArgRoles(edge) {
    if (edge && edge.type === "hyperedge" && edge.elements.length > 0) {
      const firstEl = edge.elements[0];
      if (firstEl && firstEl.token) {
        const parts = firstEl.token.split("/");
        if (parts.length > 1) {
          const typeParts = parts[1].split(".");
          if (typeParts.length > 1) {
            return typeParts[1];
          }
        }
      }
    }
    return "";
  }

  replaceArgRoles(edge, newRoles) {
    const newEdge = { ...edge };
    const firstEl = { ...newEdge.elements[0] };
    const parts = firstEl.token.split("/");
    const typeParts = parts[1].split(".");
    typeParts[1] = newRoles;
    parts[1] = typeParts.join(".");
    firstEl.token = parts.join("/");
    newEdge.elements[0] = firstEl;
    return newEdge;
  }

  processColonConjunctions(edge) {
    if (!edge || edge.atom || !edge.elements) {
      return edge;
    }

    const newElements = edge.elements.map((e) =>
      this.processColonConjunctions(e)
    );
    const newEdge = { ...edge, elements: newElements };

    if (newEdge.elements[0].token === ":/J/.") {
      // This is a placeholder for the logic in the python file.
    }

    return newEdge;
  }

  /**
   * Preprocess text with normalization
   * @param {string} text - Input text
   * @returns {string} Preprocessed text
   * @private
   */
  preprocessText(text) {
    const doc = compromise(text);
    doc.contractions().expand();
    doc.normalize();
    return doc.text();
  }

  /**
   * Detect compound entities in text
   * @param {string} originalText - Original input text
   * @param {string} preprocessedText - Preprocessed text
   * @returns {DetectedEntity[]} Array of detected entities
   * @private
   */
  detectEntities(originalText, preprocessedText) {
    if (!this.options.enableEntityPreprocessing) {
      return [];
    }

    this.compoundEntities.clear();
    const doc = compromise(originalText);
    const detectedEntities = [];

    // Auto-detection only if explicitly enabled
    if (this.options.entityPreprocessing?.autoDetect) {
      const people = doc.people().json();
      const places = doc.places().json();
      const organizations = doc.organizations().json();
      const values =
        typeof doc.values === "function" ? doc.values().json() : [];
      const allEntities = [...people, ...places, ...organizations, ...values];

      // Process multi-word entities
      allEntities.forEach((entity) => {
        const entityText = entity.text;
        const normalText = entity.normal || entityText.toLowerCase();

        const maxWords =
          this.options.entityPreprocessing?.maxCompoundWords ?? 4;
        if (
          entityText.includes(" ") &&
          entityText.split(" ").length <= maxWords
        ) {
          const compoundKey = normalText.replace(/\s+/g, "_");
          const entityData = {
            compound: compoundKey,
            type: this.getEntityType(entity),
            original: entityText,
            words: entityText.split(" "),
          };

          this.compoundEntities.set(entityText.toLowerCase(), entityData);

          detectedEntities.push({
            text: entityText,
            compound: compoundKey,
            type: entityData.type,
            words: entityData.words,
            startPosition: entity.offset?.start || 0,
            endPosition: entity.offset?.end || entityText.length,
          });
        }
      });
    }

    // Include user-provided compound entities (list)
    const providedList = this.options.entityPreprocessing?.compoundList || [];
    for (const phrase of providedList) {
      if (typeof phrase !== "string" || phrase.trim().length === 0) continue;
      const phraseLc = phrase.toLowerCase();
      if (originalText.toLowerCase().includes(phraseLc)) {
        const words = phrase.split(/\s+/);
        if (
          words.length > 1 &&
          words.length <=
            (this.options.entityPreprocessing?.maxCompoundWords ?? 4)
        ) {
          const compoundKey = phraseLc.replace(/\s+/g, "_");
          const entityData = {
            compound: compoundKey,
            type: "compound_concept",
            original: phrase,
            words,
          };
          this.compoundEntities.set(phraseLc, entityData);
          detectedEntities.push({
            text: phrase,
            compound: compoundKey,
            type: entityData.type,
            words,
            startPosition: 0,
            endPosition: 0,
          });
        }
      }
    }

    // Include user-provided compound map with types
    const providedMap = this.options.entityPreprocessing?.compoundMap || {};
    for (const [phrase, type] of Object.entries(providedMap)) {
      if (typeof phrase !== "string" || phrase.trim().length === 0) continue;
      const phraseLc = phrase.toLowerCase();
      if (originalText.toLowerCase().includes(phraseLc)) {
        const words = phrase.split(/\s+/);
        if (
          words.length > 1 &&
          words.length <=
            (this.options.entityPreprocessing?.maxCompoundWords ?? 4)
        ) {
          const compoundKey = phraseLc.replace(/\s+/g, "_");
          const entityData = {
            compound: compoundKey,
            type: typeof type === "string" && type ? type : "compound_concept",
            original: phrase,
            words,
          };
          this.compoundEntities.set(phraseLc, entityData);
          detectedEntities.push({
            text: phrase,
            compound: compoundKey,
            type: entityData.type,
            words,
            startPosition: 0,
            endPosition: 0,
          });
        }
      }
    }

    // Conservative noun-phrase compounds: allow only multi-word ProperNoun or Noun+Noun without punctuation
    const compromiseDoc = compromise(originalText);
    const maxWords = this.options.entityPreprocessing?.maxCompoundWords ?? 4;
    const minFreq = this.options.entityPreprocessing?.minFrequency ?? 2;

    // Helper to count occurrences of a phrase
    const countOccurrences = (lower) =>
      (
        originalText
          .toLowerCase()
          .match(
            new RegExp(
              `\\b${lower.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`,
              "g"
            )
          ) || []
      ).length;

    // Strict patterns
    const properChains = compromiseDoc.match("#ProperNoun{2,}").json();
    const nounNoun = compromiseDoc.match("#Noun #Noun").json();

    const candidates = this.options.entityPreprocessing?.autoDetect
      ? [...properChains, ...nounNoun]
      : [];
    for (const phrase of candidates) {
      const text = (phrase.text || "").trim();
      if (!text || !text.includes(" ")) continue;
      const words = text.split(/\s+/);
      if (words.length < 2 || words.length > maxWords) continue;
      // Reject if ends with punctuation or contains comma/ellipsis/dash
      if (/[,.…—-]$/.test(text) || /[,.…—-]/.test(text)) continue;
      // Allow only inner function words if whitelisted
      const inner = words.slice(1, -1).map((w) => w.toLowerCase());
      const allowed =
        this.options.entityPreprocessing?.allowFunctionWords || [];
      if (
        inner.some(
          (w) =>
            [
              "the",
              "a",
              "an",
              "and",
              "or",
              "but",
              "to",
              "in",
              "on",
              "for",
              "at",
              "by",
              "with",
            ].includes(w) && !allowed.includes(w)
        )
      ) {
        continue;
      }
      const lower = text.toLowerCase();
      const freq = countOccurrences(lower);
      // If not a recognized named entity, require min frequency
      const isNE =
        compromise(text).people().found ||
        compromise(text).places().found ||
        compromise(text).organizations().found;
      if (!isNE && freq < minFreq) continue;

      const compoundKey = lower.replace(/\s+/g, "_");
      const entityData = {
        compound: compoundKey,
        type: isNE ? "C" : "compound_concept",
        original: text,
        words,
      };
      this.compoundEntities.set(lower, entityData);
      detectedEntities.push({
        text,
        compound: compoundKey,
        type: entityData.type,
        words,
        startPosition: phrase.offset?.start || 0,
        endPosition: phrase.offset?.end || text.length,
      });
    }

    // Remove duplicates based on compound key
    const uniqueEntities = [];
    const seen = new Set();

    detectedEntities.forEach((entity) => {
      if (!seen.has(entity.compound)) {
        seen.add(entity.compound);
        uniqueEntities.push(entity);
      }
    });

    return uniqueEntities;
  }

  /**
   * Get entity type from Compromise entity
   * @param {Object} entity - Compromise entity object
   * @returns {string} Entity type
   * @private
   */
  getEntityType(entity) {
    if (entity.tags?.includes("Person")) return "person";
    if (entity.tags?.includes("Place")) return "place";
    if (entity.tags?.includes("Organization")) return "organization";
    if (entity.tags?.includes("Value")) return "value";

    // Use Compromise's built-in analysis for additional type detection
    const entityDoc = compromise(entity.text);

    if (entityDoc.people().length > 0) return "person";
    if (entityDoc.places().length > 0) return "place";
    if (entityDoc.organizations().length > 0) return "organization";
    if (typeof entityDoc.values === "function" && entityDoc.values().length > 0)
      return "value";

    // Check if it's a proper noun compound (capitalized multi-word)
    const words = entity.text.split(" ");
    if (words.length > 1 && words.every((word) => /^[A-Z]/.test(word))) {
      return "proper_compound";
    }

    return "entity";
  }

  /**
   * Classify atoms with all enhancements
   * @param {string} text - Preprocessed text
   * @returns {AtomClassification[]} Classified atoms
   * @private
   */
  classifyAtoms(text) {
    // Get base classifications
    const baseClassifications = this.classifier.classifyText(text);

    // Process compound entities
    const processedClassifications =
      this.processCompoundEntities(baseClassifications);

    // Apply BM25 and other enhancements
    return this.applyEnhancements(processedClassifications, text);
  }

  /**
   * Process compound entities in classifications
   * @param {Object[]} classifications - Base classifications
   * @returns {Object[]} Processed classifications
   * @private
   */
  processCompoundEntities(classifications) {
    const result = [];
    let i = 0;

    while (i < classifications.length) {
      const classification = classifications[i];
      const token = classification.features.token;

      // Check for compound entities starting at this position
      let foundCompound = null;
      let compoundLength = 0;

      for (const [entityText, entityData] of this.compoundEntities.entries()) {
        const entityWords = entityData.words;
        if (
          entityWords.length > 0 &&
          token.toLowerCase() === entityWords[0].toLowerCase()
        ) {
          // Verify following tokens match
          let matches = true;
          for (let j = 1; j < entityWords.length; j++) {
            if (
              i + j >= classifications.length ||
              classifications[i + j].features.token.toLowerCase() !==
                entityWords[j].toLowerCase()
            ) {
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
        // Create compound classification
        const compoundClassification = {
          token: foundCompound.compound,
          prediction: this.getCompoundPrediction(foundCompound),
          confidence: 0.95,
          enhancements: [`Compound entity: ${foundCompound.original}`],
          contextRelevance: 0,
          isCompound: true,
          originalTokens: foundCompound.words,
          compoundType: foundCompound.type,
        };

        result.push(compoundClassification);
        i += compoundLength;
      } else {
        // Convert to standard format
        result.push({
          token: classification.features.token,
          prediction: classification.prediction,
          confidence: classification.confidence,
          enhancements: [],
          contextRelevance: 0,
          isCompound: false,
          originalTokens: [classification.features.token],
          compoundType: null,
        });
        i++;
      }
    }

    return result;
  }

  /**
   * Get prediction type for compound entities
   * @param {Object} entityData - Entity data
   * @returns {string} Prediction type
   * @private
   */
  getCompoundPrediction(entityData) {
    switch (entityData.type) {
      case "person":
      case "place":
      case "organization":
      case "proper_compound":
      case "compound_concept":
        return "C";
      case "value":
        return "M";
      default:
        return "C";
    }
  }

  /**
   * Apply BM25 and Compromise enhancements
   * @param {Object[]} classifications - Processed classifications
   * @param {string} text - Input text
   * @returns {AtomClassification[]} Enhanced classifications
   * @private
   */
  applyEnhancements(classifications, text) {
    const doc = compromise(text);
    let contextVector = null;

    if (this.options.enableBM25 && this.bm25) {
      const winkDoc = this.nlp.readDoc(text);
      const docTokens = winkDoc.tokens().out(this.its.normal);
      contextVector = this.bm25.vectorOf(docTokens);
    }

    // Build entity relationships if enabled
    if (this.options.enableBM25) {
      this.entityRelationships = this.buildEntityRelationshipMap(text, doc);
    }

    return classifications.map((classification) => {
      if (classification.isCompound) {
        return classification; // Already processed
      }

      const token = classification.token.toLowerCase();
      let newPrediction = classification.prediction;
      let newConfidence = classification.confidence;
      const enhancements = [];

      // BM25 context enhancement
      if (this.options.enableBM25 && this.bm25 && contextVector) {
        const atomVector = this.getBM25VectorForToken(token);
        const contextRelevance = this.cosine(atomVector, contextVector);

        if (contextRelevance > (this.options.bm25?.contextThreshold ?? 0.1)) {
          newConfidence *= 1 + contextRelevance * 0.5;
          enhancements.push(
            `BM25 context boost: ${contextRelevance.toFixed(3)}`
          );
          classification.contextRelevance = contextRelevance;
        }
      }

      // Compromise enhancements
      const compromiseEnhancements = this.applyCompromiseEnhancements(
        token,
        newPrediction,
        newConfidence,
        doc
      );
      newPrediction = compromiseEnhancements.prediction;
      newConfidence = compromiseEnhancements.confidence;
      enhancements.push(...compromiseEnhancements.enhancements);

      return {
        ...classification,
        prediction: newPrediction,
        confidence: Math.min(newConfidence, 1.0),
        enhancements: enhancements,
      };
    });
  }

  /**
   * Apply Compromise.js enhancements
   * @param {string} token - Token to enhance
   * @param {string} prediction - Current prediction
   * @param {number} confidence - Current confidence
   * @param {Object} doc - Compromise document
   * @returns {Object} Enhanced prediction data
   * @private
   */
  applyCompromiseEnhancements(token, prediction, confidence, doc) {
    const enhancements = [];

    // Get linguistic categories
    const people = new Set(
      doc
        .people()
        .json()
        .map((p) => p.normal?.toLowerCase() || p.text?.toLowerCase())
    );
    const places = new Set(
      doc
        .places()
        .json()
        .map((p) => p.normal?.toLowerCase() || p.text?.toLowerCase())
    );
    const orgs = new Set(
      doc
        .organizations()
        .json()
        .map((o) => o.normal?.toLowerCase() || o.text?.toLowerCase())
    );
    const verbs = new Set(
      doc
        .verbs()
        .json()
        .map((v) => v.normal?.toLowerCase() || v.text?.toLowerCase())
    );
    const prepositions = new Set(
      doc
        .match("#Preposition")
        .json()
        .map((p) => p.normal?.toLowerCase() || p.text?.toLowerCase())
    );
    const conjunctions = new Set(
      doc
        .match("#Conjunction")
        .json()
        .map((c) => c.normal?.toLowerCase() || c.text?.toLowerCase())
    );
    const adjectives = new Set(
      doc
        .adjectives()
        .json()
        .map((a) => a.normal?.toLowerCase() || a.text?.toLowerCase())
    );
    const adverbs = new Set(
      doc
        .adverbs()
        .json()
        .map((a) => a.normal?.toLowerCase() || a.text?.toLowerCase())
    );
    const determiners = new Set(
      doc
        .match("#Determiner")
        .json()
        .map((d) => d.normal?.toLowerCase() || d.text?.toLowerCase())
    );
    const numbers = new Set();

    // Apply enhancements
    if (people.has(token) || places.has(token) || orgs.has(token)) {
      if (prediction !== "C") {
        prediction = "C";
        confidence = Math.max(confidence, 0.95);
        enhancements.push("Named entity → C");
      }
    } else if (verbs.has(token) && prediction !== "P") {
      prediction = "P";
      confidence = Math.max(confidence, 0.9);
      enhancements.push("Verb → P");
    } else if (prepositions.has(token) && prediction !== "T") {
      prediction = "T";
      confidence = Math.max(confidence, 0.9);
      enhancements.push("Preposition → T");
    } else if (conjunctions.has(token) && prediction !== "J") {
      prediction = "J";
      confidence = Math.max(confidence, 0.9);
      enhancements.push("Conjunction → J");
    } else if (
      (adjectives.has(token) ||
        adverbs.has(token) ||
        determiners.has(token) ||
        numbers.has(token)) &&
      prediction !== "M"
    ) {
      prediction = "M";
      confidence = Math.max(confidence, 0.85);
      enhancements.push("Modifier → M");
    }

    return { prediction, confidence, enhancements };
  }

  /**
   * Build entity relationship map using BM25
   * @param {string} text - Input text
   * @param {Object} doc - Compromise document
   * @returns {Map} Entity relationships
   * @private
   */
  buildEntityRelationshipMap(text, doc) {
    const relationships = new Map();

    if (!this.bm25) return relationships;

    const people = doc.people().json();
    const places = doc.places().json();
    const organizations = doc.organizations().json();
    const allEntities = [...people, ...places, ...organizations];

    allEntities.forEach((entity1) => {
      allEntities.forEach((entity2) => {
        if (entity1 !== entity2) {
          const normal1 = entity1.normal || entity1.text.toLowerCase();
          const normal2 = entity2.normal || entity2.text.toLowerCase();

          const vector1 = this.getBM25VectorForToken(normal1);
          const vector2 = this.getBM25VectorForToken(normal2);
          const sim = this.cosine(vector1, vector2);

          if (sim > (this.options.bm25?.relationshipThreshold ?? 0.2)) {
            relationships.set(`${normal1}-${normal2}`, {
              similarity: sim,
              type1: entity1.tags?.[0] || "entity",
              type2: entity2.tags?.[0] || "entity",
            });
          }
        }
      });
    });

    return relationships;
  }

  /**
   * Convert vector returned by BM25 into a BoW suitable for wink similarity
   * @param {Array|Object} vec - BM25 vector (sparse object or dense array)
   * @returns {Object} Bag-of-words object with non-zero dimensions
   * @private
   */
  toBoW(vec) {
    if (!vec) return {};
    if (Array.isArray(vec)) {
      const bow = {};
      for (let i = 0; i < vec.length; i++) {
        const w = vec[i];
        if (w) bow[i] = w;
      }
      return bow;
    }
    // assume sparse object mapping index -> weight
    return vec;
  }

  /**
   * Cosine similarity using wink similarity utility (bow.cosine)
   * @param {Array|Object} vec1
   * @param {Array|Object} vec2
   * @returns {number}
   * @private
   */
  cosine(vec1, vec2) {
    try {
      // Cast to any to use wink's bow.cosine without TS type noise
      const simAny = /** @type {any} */ (similarity);
      if (simAny && simAny.bow && typeof simAny.bow.cosine === "function") {
        return simAny.bow.cosine(this.toBoW(vec1), this.toBoW(vec2)) || 0;
      }
      return this.cosineFallback(vec1, vec2);
    } catch (_) {
      return this.cosineFallback(vec1, vec2);
    }
  }

  /**
   * Fallback cosine if wink similarity is unavailable
   * @private
   */
  cosineFallback(vec1, vec2) {
    const b1 = this.toBoW(vec1);
    const b2 = this.toBoW(vec2);
    const keys1 = Object.keys(b1);
    const keys2 = Object.keys(b2);
    if (keys1.length === 0 || keys2.length === 0) return 0;
    let dot = 0;
    let n1 = 0;
    let n2 = 0;
    for (const k of keys1) {
      const w = b1[k];
      n1 += w * w;
      if (k in b2) dot += w * b2[k];
    }
    for (const k of keys2) {
      const w = b2[k];
      n2 += w * w;
    }
    if (n1 === 0 || n2 === 0) return 0;
    return dot / (Math.sqrt(n1) * Math.sqrt(n2));
  }

  /**
   * Cached BM25 vector for a single token
   * @param {string} token
   * @returns {Object|Array}
   * @private
   */
  getBM25VectorForToken(token) {
    if (!this._vectorCache) this._vectorCache = new Map();
    const key = `t:${token}`;
    if (this._vectorCache.has(key)) return this._vectorCache.get(key);
    const v = this.bm25.vectorOf([token]);
    this._vectorCache.set(key, v);
    return v;
  }

  /**
   * Build hypergraph from classified atoms
   * @param {AtomClassification[]} atoms - Classified atoms
   * @param {string} text - Input text
   * @returns {HypergraphEdge} Hypergraph structure
   * @private
   */
  buildHypergraph(atoms, text) {
    // Process punctuation if enabled
    let processedAtoms = atoms;
    if (this.options.enablePunctuationHandling) {
      processedAtoms = this.processPunctuationStructures(atoms);
    }

    // Build connectivity map
    const connectivityMap = this.buildConnectivityMap(text);

    // Parse with iterations
    let sequence = processedAtoms.filter((atom) => atom.prediction !== "X");
    let iteration = 0;

    while (sequence.length > 1 && iteration < this.options.maxIterations) {
      const originalLength = sequence.length;
      sequence = this.parseIteration(sequence, connectivityMap);

      if (sequence.length === originalLength) {
        break; // No more rules applicable
      }
      iteration++;
    }

    this.parsingIterations = iteration;

    // Build final result
    if (sequence.length === 1) {
      // Wrap single atom into a trivial hyperedge for consistent typing
      const only = sequence[0];
      if (only && only.type === "hyperedge") return only;
      return { type: "hyperedge", elements: [only] };
    } else if (sequence.length > 1) {
      // If the sequence contains a predicate, it's likely a single sentence.
      const hasPredicate = sequence.some(
        (item) => this.getAtomType(item) === "P"
      );
      if (hasPredicate) {
        return { type: "hyperedge", elements: sequence, isSentence: true };
      }
      return { type: "hyperedge", elements: [":/J/.", ...sequence] };
    } else {
      return { type: "hyperedge", elements: [":/J/."] };
    }
  }

  /**
   * Process punctuation structures
   * @param {AtomClassification[]} atoms - Classified atoms
   * @returns {AtomClassification[]} Processed atoms
   * @private
   */
  processPunctuationStructures(atoms) {
    // Handle sentence boundaries
    return atoms.map((atom) => {
      const token = atom.token;
      if (
        atom.prediction === "X" &&
        (token === "." || token === "!" || token === "?")
      ) {
        return {
          type: "sentence_boundary",
          terminator: token,
          original: atom,
        };
      }
      return atom;
    });
  }

  /**
   * Build connectivity map for syntactic relationships
   * @param {string} text - Input text
   * @returns {Map} Connectivity map
   * @private
   */
  buildConnectivityMap(text) {
    const doc = compromise(text);
    const connectivityMap = new Map();
    const chunks = doc.chunks().out("json");
    for (const chunk of chunks) {
      const tokens = chunk.terms.map((term) => term.text.toLowerCase());
      for (let i = 0; i < tokens.length; i++) {
        for (let j = i + 1; j < tokens.length; j++) {
          const token1 = tokens[i];
          const token2 = tokens[j];
          if (!connectivityMap.has(token1)) {
            connectivityMap.set(token1, []);
          }
          if (!connectivityMap.has(token2)) {
            connectivityMap.set(token2, []);
          }
          connectivityMap.get(token1).push(token2);
          connectivityMap.get(token2).push(token1);
        }
      }
    }
    return connectivityMap;
  }

  /**
   * Parse iteration with global rule selection
   * @param {Object[]} atoms - Current atom sequence
   * @param {Map} connectivityMap - Connectivity map
   * @returns {Object[]} Updated sequence
   * @private
   */
  parseIteration(atoms, connectivityMap) {
    let bestAction = null;
    let bestScore = -999999999;

    // Filter out sentence boundaries
    const parseableAtoms = atoms.filter(
      (atom) => !atom.type || atom.type !== "sentence_boundary"
    );

    // Try all rules at all positions
    for (const rule of this.rules) {
      for (let pos = 0; pos <= parseableAtoms.length - rule.size; pos++) {
        const newEdge = this.applyRuleWithPivot(rule, parseableAtoms, pos);

        if (newEdge) {
          const window = parseableAtoms.slice(pos, pos + rule.size);
          const score = this.scoreRuleApplication(
            rule,
            window,
            connectivityMap
          );

          if (score > bestScore) {
            bestAction = {
              rule: rule,
              position: pos,
              newEdge: newEdge,
              size: rule.size,
            };
            bestScore = score;
          }
        }
      }
    }

    // Apply best rule
    if (bestAction) {
      const newSequence = [
        ...parseableAtoms.slice(0, bestAction.position),
        bestAction.newEdge,
        ...parseableAtoms.slice(bestAction.position + bestAction.size),
      ];

      // Reintegrate sentence boundaries
      const boundaries = atoms.filter(
        (atom) => atom.type === "sentence_boundary"
      );
      return [...newSequence, ...boundaries];
    }

    return atoms;
  }

  /**
   * Apply rule with pivot-based approach
   * @param {Object} rule - Grammar rule
   * @param {Object[]} atoms - Atom sequence
   * @param {number} position - Position to apply rule
   * @returns {Object|null} New hyperedge or null
   * @private
   */
  applyRuleWithPivot(rule, atoms, position) {
    const windowSize = rule.size;
    if (position + windowSize > atoms.length) return null;

    for (let pivotPos = 0; pivotPos < windowSize; pivotPos++) {
      const args = [];
      let pivot = null;
      let valid = true;

      for (let i = 0; i < windowSize; i++) {
        const atom = atoms[position + i];
        const atomType = this.getAtomType(atom);

        if (i === pivotPos) {
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
          if (rule.allowedTypes.includes(atomType)) {
            args.push(atom);
          } else {
            valid = false;
            break;
          }
        }
      }

      if (valid) {
        if (rule.connector) {
          return { type: "hyperedge", elements: [rule.connector, ...args] };
        } else if (pivot) {
          return { type: "hyperedge", elements: [pivot, ...args] };
        }
      }
    }

    return null;
  }

  /**
   * Get atom type from atom object
   * @param {Object} atom - Atom object
   * @returns {string} Atom type
   * @private
   */
  getAtomType(atom) {
    if (typeof atom === "string") {
      return atom.split("/")[1]?.charAt(0) || "C";
    }
    if (atom.type === "sentence_boundary") {
      return "X";
    }
    if (atom.prediction) {
      return atom.prediction;
    }
    return "C";
  }

  /**
   * Build hyperedge with proper structure
   * @param {Object} rule - Grammar rule
   * @param {Object} pivot - Pivot atom
   * @param {Object[]} args - Arguments
   * @returns {Object} Hyperedge
   * @private
   */
  buildHyperedge(rule, pivot, args) {
    switch (rule.type) {
      case "C":
        if (rule.connector === "+/B/.") {
          return { type: "hyperedge", elements: ["+/B/.", ...args] };
        }
        return {
          type: "hyperedge",
          elements: [pivot || args[0], ...args.slice(pivot ? 0 : 1)],
        };

      case "M":
        if (args.length === 1) {
          const target = args[0];
          if (target.type === "hyperedge") {
            return {
              type: "hyperedge",
              elements: [
                target.elements[0],
                pivot,
                ...target.elements.slice(1),
              ],
            };
          } else {
            return { type: "hyperedge", elements: [target, pivot] };
          }
        }
        return { type: "hyperedge", elements: [pivot, ...args] };

      case "P":
        return { type: "hyperedge", elements: [pivot, ...args] };

      case "T":
        return { type: "hyperedge", elements: [pivot, ...args] };

      case "B":
        return { type: "hyperedge", elements: [pivot, ...args] };

      case "J":
        return { type: "hyperedge", elements: [pivot, ...args] };

      default:
        return { type: "hyperedge", elements: [pivot, ...args] };
    }
  }

  /**
   * Score rule application
   * @param {Object} rule - Grammar rule
   * @param {Object[]} window - Window of atoms
   * @param {Map} connectivityMap - Connectivity map
   * @returns {number} Score
   * @private
   */
  scoreRuleApplication(rule, window, connectivityMap) {
    let score = 0;

    // Connectivity bonus
    if (this.areConnected(window, connectivityMap)) {
      score += 10000000;
    }

    // Rule priority
    score -= rule.priority * 10000;

    // Type-specific bonuses
    if (rule.type === "P") {
      score += 1000000;
      score += rule.size * 50000;
    } else if (rule.type === "B" || rule.connector === "+/B/.") {
      score += 500000;
    } else if (rule.type === "M") {
      score += 200000;
    } else if (rule.type === "T") {
      score += 100000;
    } else if (rule.type === "J") {
      score -= 100000;
    }

    score += rule.size * 1000;

    // BM25 coherence bonus
    if (this.options.enableBM25 && this.bm25) {
      const coherenceScore = this.calculateSemanticCoherence(window);
      const weight = this.options.bm25?.coherenceWeight ?? 500000;
      score += coherenceScore * weight;
    }

    return score;
  }

  /**
   * Check if atoms are connected
   * @param {Object[]} atoms - Atoms to check
   * @param {Map} connectivityMap - Connectivity map
   * @returns {boolean} Connection status
   * @private
   */
  areConnected(atoms, connectivityMap) {
    if (atoms.length <= 1) return true;

    const atomTokens = atoms.map((atom) => this.getToken(atom));

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
   * Get token from atom
   * @param {Object} atom - Atom object
   * @returns {string} Token
   * @private
   */
  getToken(atom) {
    if (typeof atom === "string") {
      return atom.split("/")[0].toLowerCase();
    }
    if (atom.type === "sentence_boundary") {
      return atom.terminator;
    }
    return atom.token?.toLowerCase() || atom.toString().toLowerCase();
  }

  /**
   * Calculate semantic coherence for window
   * @param {Object[]} window - Window of atoms
   * @returns {number} Coherence score
   * @private
   */
  calculateSemanticCoherence(window) {
    if (window.length <= 1 || !this.bm25) return 0;

    const windowTokens = window.map((atom) => this.getToken(atom));
    let totalSimilarity = 0;
    let pairs = 0;

    for (let i = 0; i < windowTokens.length; i++) {
      for (let j = i + 1; j < windowTokens.length; j++) {
        const vec1 = this.getBM25VectorForToken(windowTokens[i]);
        const vec2 = this.getBM25VectorForToken(windowTokens[j]);
        const sim = this.cosine(vec1, vec2);

        totalSimilarity += sim;
        pairs++;
      }
    }

    return pairs > 0 ? totalSimilarity / pairs : 0;
  }

  /**
   * Calculate comprehensive metrics
   * @param {AtomClassification[]} atoms - Classified atoms
   * @param {HypergraphEdge} hypergraph - Parsed hypergraph
   * @param {number} startTime - Start time
   * @returns {ParsingMetrics} Metrics object
   * @private
   */
  calculateMetrics(atoms, hypergraph, startTime) {
    const totalTokens = atoms.length;
    const compoundEntities = atoms.filter((atom) => atom.isCompound).length;
    const averageConfidence =
      atoms.reduce((sum, atom) => sum + atom.confidence, 0) / totalTokens;

    let semanticCoherenceScore = 0;
    if (this.options.enableBM25 && atoms.length > 1) {
      semanticCoherenceScore = this.calculateSemanticCoherence(atoms);
    }

    return {
      totalTokens: totalTokens,
      compoundEntities: compoundEntities,
      parsingIterations: this.parsingIterations || 0,
      averageConfidence: averageConfidence,
      semanticCoherenceScore: semanticCoherenceScore,
      processingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Convert hypergraph to string representation
   * @param {HypergraphEdge} hypergraph - Hypergraph structure
   * @returns {string} String representation
   */
  hypergraphToString(hypergraph) {
    if (typeof hypergraph === "string") return hypergraph;

    if (hypergraph && hypergraph.type === "hyperedge") {
      return (
        "(" +
        hypergraph.elements
          .map((e) => (typeof e === "string" ? e : this.hypergraphToString(e)))
          .join(" ") +
        ")"
      );
    }

    if (hypergraph && hypergraph.type === "sentence_boundary") {
      return hypergraph.terminator || ".";
    }

    if (hypergraph && hypergraph.token) {
      const subtype = this.inferSubtype(
        hypergraph.token,
        hypergraph.prediction,
        hypergraph
      );
      return `${hypergraph.token}/${hypergraph.prediction}${subtype}`;
    }

    return String(hypergraph);
  }

  /**
   * Infer subtype for GraphBrain notation
   * @param {string} token - Token
   * @param {string} type - Type
   * @param {Object} features - Features
   * @returns {string} Subtype
   * @private
   */
  inferSubtype(token, type, features = {}) {
    switch (type) {
      case "C":
        if (features.isCompound) {
          return this.inferCompoundSubtype(features);
        }
        return this.inferSingleTokenSubtype(token);
      case "M":
        return this.inferModifierSubtype(features);
      case "P":
        return "d.so"; // Declarative with subject-object
      case "B":
        return ".am"; // Auxiliary-main pattern
      default:
        return "";
    }
  }

  inferCompoundSubtype(features) {
    switch (features.compoundType) {
      case "person":
      case "place":
      case "organization":
      case "proper_compound":
        return "p"; // Proper noun
      case "value":
        return "#"; // Number/value
      case "compound_concept":
        const compoundText = features.originalTokens.join(" ");
        const compoundDoc = compromise(compoundText);
        if (
          compoundDoc.match("#ProperNoun").found ||
          compoundDoc.people().found ||
          compoundDoc.places().found ||
          compoundDoc.organizations().found
        ) {
          return "p";
        }
        return "c";
      default:
        return "c";
    }
  }

  inferSingleTokenSubtype(token) {
    const singleTokenDoc = compromise(token);
    if (
      singleTokenDoc.match("#ProperNoun").found ||
      singleTokenDoc.people().found ||
      singleTokenDoc.places().found ||
      singleTokenDoc.organizations().found
    ) {
      return "p";
    }
    if (/^\d+$/.test(token)) return "#";
    return "c";
  }

  inferModifierSubtype(features) {
    if (features.isCompound || features.originalTokens) {
      const lowerTokens =
        features.originalTokens?.map((t) => t.toLowerCase()) || [];
      if (
        lowerTokens.includes("the") ||
        lowerTokens.includes("a") ||
        lowerTokens.includes("an")
      ) {
        return "d"; // Determiner
      }
      return "a"; // Adverbial for compound modifiers
    }
    return "d"; // Default to determiner for single tokens
  }

  /**
   * Get parser version and info
   * @returns {Object} Parser information
   */
  getInfo() {
    return {
      name: "Production Semantic Hypergraph Parser",
      version: "1.0.0",
      features: {
        entityPreprocessing: this.options.enableEntityPreprocessing,
        bm25Enhancement: this.options.enableBM25,
        punctuationHandling: this.options.enablePunctuationHandling,
      },
      initialized: this.initialized,
    };
  }
}

module.exports = {
  ProductionHypergraphParser,
};

// Example usage and demo
async function demonstrateProductionParser() {
  console.log("🚀 Production Semantic Hypergraph Parser");
  console.log("========================================");

  const parser = new ProductionHypergraphParser({
    debug: false,
    enableBM25: true,
    enableEntityPreprocessing: true,
    enablePunctuationHandling: true,
  });

  try {
    await parser.initialize();
    console.log("✅ Parser initialized successfully");
    console.log(JSON.stringify(parser.getInfo(), null, 2));

    const testSentences = [
      "The old man gave his grandson a beautiful book.",
      "Dr. Smith works at Harvard University in Boston.",
      `During the 2024 campaign, Trump’s platform included a 10 percent tax on all imports.`,
      `This was a dumb idea, a massively regressive tax that would have a negative impact on American exporters, and it was widely criticized at the time.`,
      `The Trump administration’s business community supporters would often claim that it was just a negotiating tactic — Trump was going to “escalate to de-escalate” and win big market access concessions for American companies.`,
      `Once in office, he began imposing tariffs that were actually more draconian than the 10 percent campaign pledge. But he did say that he was going to try to negotiate deals.`,
      `Now, as the text of some of those deals is coming out, we’re seeing a few things.`,
      `One is that Trump is securing some market access wins for American companies.`,
      `But another is that he is not interested in negotiating “zero for zero” deals where trade ends up freer than it was before.`,
      `Typically, Trump is reaching asymmetrical agreements where the United States will, for example, impose higher tariffs on EU exports than the EU imposes on us and the EU agrees not to retaliate.`,
      `This is pretty impressive as a feat of negotiating, and I do think it serves as a reminder that it’s dangerous to underestimate Trump.`,
      `He is credibly willing to engage in tit-for-tat escalations that are bad for everyone, and this gets other countries to make settlements with him that are in some sense “unfair” or “lopsided.”`,
      `But this success just raises the question of why the United States would find the arrangement desirable.`,
      `I think the answer, from Trump’s perspective, is that tariffs concentrate a lot of power in his hands personally.`,
      `Trump is able to grant exemptions to politically connected companies, and this is good for his personal quest for power and enrichment.`,
      `But it’s still a bad dynamic for America.`,
      "But this success just raises the question of why the United States would find the arrangement desirable.",
      "I think the answer, from Trump’s perspective, is that tariffs concentrate a lot of power in his hands personally.",
      "Trump is able to grant exemptions to politically connected companies, and this is good for his personal quest for power and enrichment.",
      "But it’s still a bad dynamic for America.",
      "Take this guy from the Montana Knife Company, who initially reacted with enthusiasm to tariffs because they would boost his made-in-America products … only to discover that his costs are rising due to tariffs because he relies on imported equipment and supplies.",
      "And Montana Knife Company is almost certainly not in a position to lobby for exemptions.",
      "The initial freakout over Liberation Day tariffs represented a concern about a total breakdown of global trade.",
      "What Trump has secured with his deals is a guarantee that big successful American companies such as NVIDIA, Meta, Alphabet, and Netflix won’t be torn apart by retaliatory measures.",
      "This is the dominant consideration for the stock market, which is mostly driven by the prices of the biggest and most successful companies.",
      "But I do have to note the irony that the endgame of this entire “populist” arc is to skew the American economic model even more sharply toward companies offering intangible services in tech and finance and away from manufacturers, whose competitiveness will be hurt by disrupted supply chains.",
    ];

    for (const sentence of testSentences) {
      console.log(`\n📝 Parsing: "${sentence}"`);
      console.log("- ".repeat(30));

      const result = await parser.parse(sentence);

      console.log(`🧠 Hypergraph: ${result.hypergraphString}`);
      console.log(`📊 Entities detected: ${result.entities.length}`);
      console.log(`⚡ Processing time: ${result.metrics.processingTimeMs}ms`);
      console.log(
        `🎯 Average confidence: ${(
          result.metrics.averageConfidence * 100
        ).toFixed(1)}%`
      );

      if (result.entities.length > 0) {
        console.log("🔗 Detected entities:");
        result.entities.forEach((entity) => {
          console.log(
            `   • ${entity.text} → ${entity.compound} (${entity.type})`
          );
        });
      }
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

if (require.main === module) {
  demonstrateProductionParser().catch(console.error);
}
