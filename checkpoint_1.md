# Checkpoint 1 – Effect/TS Hypergraph Core

## Scope completed

- Project converted to TypeScript with Effect as the core FP/runtime library.
- Core hypergraph domain modules implemented:
  - `src/hg/model.ts`: Atom/Hedge data models using `Schema.Data` and `Data.struct` for value equality and hashing; discriminated by `kind`.
  - `src/hg/encoding.ts`: Graphbrain-compatible atom encoding/decoding (`str2atom`, `atom2str`).
  - `src/hg/parse.ts`: Shallow string → hedge parser with safe fallback (non-paren inputs become single-atom hedges). `splitEdgeStr` implemented.
  - `src/hg/print.ts`: `toStr` for atoms/hedges.
  - `src/hg/ops.ts`: Core operations: type/mtype, argroles, structural edits (insert/connect/replace/contains/subedges/sequence), metrics (atoms/allAtoms/size/depth/roots), correctness checks (basic). Handles single-item hedges.
  - `src/hg/schema.ts`: Schema encode/decode helpers; non-strict `EdgeStringSchema` (assumes validity for now). `ParseError` tagged type scaffolded for future strict mode.

## Tests (vitest)

- Added suites under `test/` mirroring essential Graphbrain behaviors:
  - `hg_basic`: encoding, splitting, parse/print roundtrip.
  - `hg_ops`: type/mtype, argroles, normalization placeholder.
  - `hg_ops_more`: atoms/allAtoms, size/depth, roots.
  - `hg_ops_struct`: insert/connect, contains/subedges, edgesWithArgrole.
  - `hg_schema`: string ↔ hedge schema round-trip.
- Status: All tests passing (15/15).

## Design/implementation decisions

- Effect-first, data-first APIs; heavy use of `Schema.Data` and `Data.struct` for value semantics.
- Non-strict parsing and schema for now:
  - `hedgeFromString` always returns a `Hedge` (falls back to single-atom hedge).
  - `EdgeStringSchema` uses `transform` with non-strict decode; we will enable `transformOrFail` later.
- Normalization: unordered argroles `{...}` currently preserved (no-op) to match present test expectations; full sorting and role handling to be reintroduced with complete parity.
- Single-item hedge handling: ops treat `(X)` the same as `X` for type/roles/metrics/contains.

## Pending / next milestones

1. Patterns engine (minimal viable subset)

   - Modules: `patterns/properties`, `patterns/atoms`, `patterns/argroles`, `patterns/variables`, `patterns/common`, `patterns/merge`, `patterns/entrypoints`, `patterns/matcher`.
   - Focus: ordered + unordered argroles, wildcards (`*`, `.`, `(\*)`), variables, open-ended `...`, simple matching.
   - Tests mapped from Python `tests/test_patterns.py` selectively.

2. In-memory hypergraph store (Key-Value)

   - `src/memory/KeyValue.ts` & thin façade service; attributes (`p/d/dd`), permutations, prefix search; pattern search/match/count.
   - Tests mapped from Python `tests/hypergraph.py` (subset to start).

3. Parser integration

   - Adapter over `production_hypergraph_parser.cjs` to produce typed `Hedge` using `str2atom` and `/en` namespace utilities.
   - Sentence-by-sentence pipeline helpers (no auto-joining).

4. Error handling & strict schema

   - Introduce `transformOrFail` and `ParseError` usage across string ↔ hedge boundaries; add `Either`/`Option` variants.

5. Cleanups & parity
   - Re-enable full normalization (unordered argroles sorting) and extend correctness checks to match `hyper_edge.pyx` exactly.
   - Add comprehensive equality-focused tests (Data equality) and more edge cases.

## Notes

- Current decisions prioritize stable, typed core with green tests; strict validation and full Graphbrain parity will be layered next.
- Performance is sufficient for dev; memory indices and pattern matching will be tuned during the memory/patterns phases.
