# Comprehensive Fix Document: JavaScript Hypergraph Parser Nesting Issues

## Problem Overview

The JavaScript hypergraph parser implementation produces flat, incorrect structures instead of the properly nested semantic hypergraphs that match GraphBrain's Python implementation.

### Current (Incorrect) Output

```
(and/J the/Md old/M man/Cc gave/Cc his/Ci grandson/Cc a/Md beautiful/M book/Cc)
(and/J dr./Cp smith/Cp works/Pd.so at/B harvard/Cp university/Cp in/Cc boston/Cp)
```

### Expected (Correct) Output

```
(gave/Pd.so (the/Md (old/Ma man/Cc)) (his/Mp grandson/Cc) (a/Md (beautiful/Ma book/Cc)))
(works/Pd.so (+/B.am dr./Cp smith/Cp) (at/T (+/B.am harvard/Cp university/Cp)) (in/T boston/Cp))
```

## GraphBrain Semantic Hypergraph Notation

### Core Principles (from graphbrain.net/manual/notation.html)

**Hyperedge Structure:**

- Every hyperedge has a **connector** (first element) followed by **arguments**
- Eight basic hyperedge types: C, P, M, B, T, J, R, S
- Arguments can be atomic or non-atomic (nested hyperedges)

**Atom Format:**

```
[value]/[Type][.optional-subparts]/[namespace]
```

**Examples:**

- `sky/Cp.s/en` - sky, proper noun, singular, English
- `gave/Pd.so` - gave, declarative predicate with subject-object roles
- `the/Md` - the, determiner modifier

**Hyperedge Types:**

- **C (Concept)**: Atomic concepts (`man/Cc`, `book/Cc`)
- **P (Predicate)**: Relations with arguments (`gave/Pd.so subject object1 object2`)
- **M (Modifier)**: Modify other hyperedges (`the/Md`, `beautiful/Ma`)
- **B (Builder)**: Build concepts from concepts (`+/B.am white/Cp house/Cp`)
- **T (Trigger)**: Specifications (`at/T`, `in/T`)
- **J (Junction)**: Conjunctions/sequences (`and/J`, `or/J`)
- **R (Relation)**: Facts/statements
- **S (Specifier)**: Relation specifications

**Argument Roles:**

- Predicates: `s` (subject), `o` (direct object), `i` (indirect object)
- Builders: `m` (main concept), `a` (auxiliary concept)

## Python Implementation Analysis

### Rule Structure (`graphbrain/parsers/alpha_beta.pyx:50-61`)

```python
repair_rules = [
    Rule('C', {'C'}, 2, '+/B/.'),           # Concept builder (HIGHEST priority)
    Rule('M', {'C', 'R', 'M', 'S', 'T', 'P', 'B', 'J'}, 2),  # Modifier application
    Rule('B', {'C', 'R'}, 3),               # Builder construction
    Rule('T', {'C', 'R'}, 2),               # Trigger specification
    Rule('P', {'C', 'R', 'S'}, 6),          # Predicate (6 arguments)
    Rule('P', {'C', 'R', 'S'}, 5),          # Predicate (5 arguments)
    Rule('P', {'C', 'R', 'S'}, 4),          # Predicate (4 arguments)
    Rule('P', {'C', 'R', 'S'}, 3),          # Predicate (3 arguments)
    Rule('P', {'C', 'R', 'S'}, 2),          # Predicate (2 arguments)
    Rule('J', {'C', 'R', 'M', 'S', 'T', 'P', 'B', 'J'}, 3), # Junction (3 args)
    Rule('J', {'C', 'R', 'M', 'S', 'T', 'P', 'B', 'J'}, 2)  # Junction (LOWEST priority)
]
```

**Key Insight:** Rule order determines priority. Earlier rules have higher precedence.

### Pivot-Based Rule Application (`alpha_beta.pyx:64-91`)

```python
def _apply_rule(rule, sentence, pos):
    for pivot_pos in range(rule.size):      # Try EACH position as pivot
        args = []
        pivot = None
        valid = True

        for i in range(rule.size):
            edge = sentence[pos - rule.size + i + 1]
            if i == pivot_pos:              # This is the connector position
                if edge.mtype() == rule.first_type:
                    if rule.connector:
                        args.append(edge)    # Use explicit connector
                    else:
                        pivot = edge         # Use edge as connector
                else:
                    valid = False
            else:                           # This is an argument position
                if edge.mtype() in rule.arg_types:
                    args.append(edge)
                else:
                    valid = False

        if valid:
            if rule.connector:
                return hedge([rule.connector] + args)    # Fixed connector
            else:
                return hedge([pivot] + args)             # Dynamic connector
```

**Key Insight:** Unlike the JavaScript version, Python tries each element in the rule window as a potential connector, not just the first element.

### Priority-Based Parsing Strategy (`alpha_beta.pyx:628-663`)

```python
def _parse_atom_sequence(self, atom_sequence):
    while True:
        action = None
        best_score = -999999999

        # Try ALL rules at ALL valid positions
        for rule_number, rule in enumerate(self.rules):
            window_start = rule.size - 1
            for pos in range(window_start, len(sequence)):
                new_edge = _apply_rule(rule, sequence, pos)
                if new_edge:
                    score = self._score(sequence[pos - window_start:pos + 1])
                    score -= rule_number        # Rule priority penalty
                    if score > best_score:
                        action = (rule, score, new_edge, window_start, pos)

        # Apply BEST scoring rule (not first matching rule)
        if action:
            rule, s, new_edge, window_start, pos = action
            sequence = sequence[:pos - window_start] + [new_edge] + sequence[pos + 1:]
        else:
            break  # No more applicable rules
```

**Key Insight:** Python evaluates ALL possible rule applications and chooses the BEST one, while JavaScript applies the first matching rule.

### Sophisticated Scoring System (`alpha_beta.pyx:607-626`)

```python
def _score(self, edges):
    # Check syntactic connectivity (huge bonus)
    conn = self._are_connected(atom_sets)

    # Prefer structures with minimum dependency depth
    mdepth = min_dependency_depth(edges)

    return (10000000 if conn else 0) + (mdepth * 100) + self._adjust_score(edges)
```

**Key Insight:** Python prioritizes syntactically connected elements and proper dependency relationships.

## Required JavaScript Fixes

### Fix 1: Correct Rule Definitions and Priorities

```javascript
// WRONG: Current implementation
initializeGrammarRules() {
    const rules = [
        new GrammarRule('C', ['C'], 2, '+/B/.'),
        new GrammarRule('M', ['C', 'R', 'M', 'S', 'T', 'P', 'B', 'J'], 2),
        // ... mixed order
    ];
}

// CORRECT: Fixed implementation
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
```

### Fix 2: Implement Pivot-Based Rule Application

```javascript
// WRONG: Current apply method - always uses first element
apply(atoms, position, scores = null) {
    const window = atoms.slice(position, position + this.arity);
    switch (this.targetType) {
        case 'P':
            return this.buildPredicate(window);  // Uses window[0] as connector
        // ...
    }
}

// CORRECT: Fixed apply method - tries each position as pivot
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
                        args.push(atom);          // Add to args, use explicit connector
                    } else {
                        pivot = atom;             // Use this atom as connector
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
            if (this.connector) {
                return new Hyperedge([this.connector, ...args]);  // Use explicit connector
            } else if (pivot) {
                return new Hyperedge([pivot, ...args]);           // Use atom as connector
            }
        }
    }

    return null;  // Rule cannot apply
}
```

### Fix 3: Replace Sequential Rule Processing with Priority-Based Selection

```javascript
// WRONG: Current parseIteration - applies first matching rule
parseIteration(sequence) {
    const newSequence = [];
    let i = 0;

    while (i < sequence.length) {
        let applied = false;

        // Try rules at current position
        for (const rule of this.rules) {
            if (rule.canApply(sequence, i)) {
                const hyperedge = rule.apply(sequence, i);
                if (hyperedge) {
                    newSequence.push(hyperedge);
                    i += rule.arity;
                    applied = true;
                    break;  // Apply FIRST matching rule
                }
            }
        }

        if (!applied) {
            newSequence.push(sequence[i]);
            i++;
        }
    }

    return newSequence;
}

// CORRECT: Fixed parseIteration - finds best scoring rule globally
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

    return sequence;  // No rules applicable - parsing complete
}
```

### Fix 4: Implement Sophisticated Scoring System

```javascript
// Add comprehensive scoring method
scoreRuleApplication(rule, window, ruleIndex) {
    let score = 100000;  // Base score

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
```

### Fix 5: Fix Specific Hyperedge Builders

```javascript
// WRONG: Current builders create flat structures
buildConcept(elements) {
    return new Hyperedge(elements);  // Flat
}

buildPredicate(elements) {
    const [predicate, ...args] = elements;
    return new Hyperedge([predicate, ...args]);  // Uses first element
}

// CORRECT: Fixed builders create proper nested structures
buildConcept(elements) {
    // Handle explicit builder connector
    if (this.connector === '+/B/.') {
        // Compound concept: "White House", "New York"
        return new Hyperedge(['+/B/.', ...elements]);
    }

    // Handle modifier + concept nesting
    if (elements.length === 2) {
        const [first, second] = elements;
        const firstType = this.getAtomType(first);
        const secondType = this.getAtomType(second);

        if (firstType === 'M' && secondType === 'C') {
            // Nested modifier-concept structure
            return new Hyperedge([second, first]);  // Concept is connector
        }
    }

    return new Hyperedge(elements);
}

buildPredicate(elements) {
    // Find the actual predicate (P type) to use as connector
    let predicateIndex = -1;
    for (let i = 0; i < elements.length; i++) {
        if (this.getAtomType(elements[i]) === 'P') {
            predicateIndex = i;
            break;
        }
    }

    if (predicateIndex >= 0) {
        // Use predicate as connector, others as arguments
        const predicate = elements[predicateIndex];
        const args = [
            ...elements.slice(0, predicateIndex),
            ...elements.slice(predicateIndex + 1)
        ];
        return new Hyperedge([predicate, ...args]);
    }

    // Fallback: use first element
    return new Hyperedge(elements);
}

buildModifier(elements) {
    // Modifier rules should nest the modified element
    if (elements.length === 2) {
        const [modifier, target] = elements;
        // Create nested structure with target as connector
        return new Hyperedge([target, modifier]);
    }
    return new Hyperedge(elements);
}

buildBuilder(elements) {
    if (elements.length === 3) {
        // Pattern: concept + builder + concept -> (builder concept1 concept2)
        const [left, builder, right] = elements;
        return new Hyperedge([builder, left, right]);
    }
    return new Hyperedge(elements);
}
```

### Fix 6: Improve Atom Normalization

```javascript
// Enhance subtype inference for proper GraphBrain format
inferSubtype(token, type, features = {}) {
    switch (type) {
        case 'C':
            // Concept subtypes
            if (features.is_person || /^[A-Z][a-z]+$/.test(token)) {
                return 'p';  // Proper noun (Cp)
            }
            if (features.pos === 'PROPN' || /^[A-Z]/.test(token)) {
                return 'p';  // Proper noun
            }
            if (features.pos === 'ADJ' || features.is_adjective) {
                return 'a';  // Adjective concept (Ca)
            }
            if (features.pos === 'PRON' || features.is_pronoun) {
                return 'i';  // Pronoun (Ci)
            }
            if (features.pos === 'NUM' || /^\d+$/.test(token)) {
                return '#';  // Number (C#)
            }
            return 'c';     // Common concept (Cc)

        case 'M':
            // Modifier subtypes
            if (features.pos === 'ADV' || features.is_adverb) {
                return 'a';  // Adverb (Ma)
            }
            if (features.pos === 'DET' || features.is_determiner) {
                return 'd';  // Determiner (Md)
            }
            if (features.pos === 'ADJ' || features.is_adjective) {
                return 'a';  // Adjective (Ma)
            }
            return '';      // Generic modifier (M)

        case 'P':
            // Predicate subtypes with roles
            return 'd.so';  // Declarative with subject-object (Pd.so)

        case 'B':
            // Builder subtypes
            return '.am';   // Auxiliary-main pattern (B.am)

        case 'T':
            // Trigger subtypes
            if (features.is_temporal) {
                return 't';  // Temporal trigger (Tt)
            }
            return '';      // Generic trigger (T)

        default:
            return '';
    }
}
```

## Example Transformation Process

**Input:** "The old man gave his grandson a beautiful book"

### Step-by-Step Parsing:

**Initial atoms:** `[the/Md, old/Ma, man/Cc, gave/Pd.so, his/Mp, grandson/Cc, a/Md, beautiful/Ma, book/Cc]`

**Iteration 1:** Apply highest priority rules (M rules)

- Rule M(2): `[the/Md, old/Ma]` → **NO MATCH** (Ma not in allowed types for M-rule target)
- Rule M(2): `[old/Ma, man/Cc]` → `(man/Cc old/Ma)` ✓

**After Iteration 1:** `[the/Md, (man/Cc old/Ma), gave/Pd.so, his/Mp, grandson/Cc, a/Md, beautiful/Ma, book/Cc]`

**Iteration 2:** Apply M rules again

- Rule M(2): `[beautiful/Ma, book/Cc]` → `(book/Cc beautiful/Ma)` ✓

**After Iteration 2:** `[the/Md, (man/Cc old/Ma), gave/Pd.so, his/Mp, grandson/Cc, a/Md, (book/Cc beautiful/Ma)]`

**Iteration 3:** Apply M rules for determiners

- Rule M(2): `[the/Md, (man/Cc old/Ma)]` → `((man/Cc old/Ma) the/Md)` ✓
- Rule M(2): `[a/Md, (book/Cc beautiful/Ma)]` → `((book/Cc beautiful/Ma) a/Md)` ✓

**After Iteration 3:** `[((man/Cc old/Ma) the/Md), gave/Pd.so, his/Mp, grandson/Cc, ((book/Cc beautiful/Ma) a/Md)]`

**Iteration 4:** Apply P rules

- Rule P(5): `[((man/Cc old/Ma) the/Md), gave/Pd.so, his/Mp, grandson/Cc, ((book/Cc beautiful/Ma) a/Md)]`
- With pivot at position 1 (gave/Pd.so): → `(gave/Pd.so ((man/Cc old/Ma) the/Md) (his/Mp grandson/Cc) ((book/Cc beautiful/Ma) a/Md))` ✓

**Final Result:**

```
(gave/Pd.so
  ((man/Cc old/Ma) the/Md)
  (his/Mp grandson/Cc)
  ((book/Cc beautiful/Ma) a/Md))
```

This matches the expected GraphBrain nested structure where:

- Modifiers are nested with their targets
- Determiners modify the already-modified concepts
- The predicate serves as the main connector
- All arguments are properly structured sub-hyperedges

## Implementation Priority

1. **Fix Rule Application Strategy** - Switch to global best-rule selection
2. **Fix Rule Definitions** - Ensure correct priority order
3. **Implement Pivot-Based Application** - Try each position as connector
4. **Add Sophisticated Scoring** - Prioritize connectivity and semantic appropriateness
5. **Fix Individual Builders** - Create proper nested structures
6. **Enhance Atom Normalization** - Generate proper GraphBrain format atoms

This will transform the current flat junction-based output into properly nested semantic hypergraphs that match GraphBrain's specification and the Python implementation's behavior.
