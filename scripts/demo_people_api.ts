import {
  Effect,
  Option,
  pipe,
  Schema as S,
  Chunk,
  HashMap,
  Predicate,
} from "effect";
import type { Hedge, Atom } from "../src/hg/model.js";
import { atom, hedge, isAtom } from "../src/hg/model.js";
import { hedgeFromString } from "../src/hg/parse.js";
import { toStr } from "../src/hg/print.js";
import * as HG from "../src/memory/Hypergraph.js";
import { findByPatternWithBindings } from "../src/memory/Hypergraph.js";
import {
  matchWithBindings,
  emptyBindings,
  type Bindings,
} from "../src/patterns/variables.js";
import {
  argrolesOf,
  atoms as edgeAtoms,
  connector,
  edgesWithArgrole,
} from "../src/hg/ops.js";

// --- Helpers ---------------------------------------------------------------

const A = (text: string) => atom(text);
const H = (...items: ReadonlyArray<Atom | Hedge>) => hedge(items);

const must = <A>(opt: Option.Option<A>, msg: string): A => {
  if (opt._tag === "None") throw new Error(msg);
  return opt.value;
};

const atomRoot = (a: Atom): string => a.text.split("/")[0] ?? "";

// --- Effect Schemas for API payloads --------------------------------------

// Each company can have its own payload schema; we register by schemaId

const CompanyA_Payload = S.Struct({
  user: S.String,
  companyCode: S.Literal("A"),
  role: S.optionalWith(S.String, { default: () => "employee" }),
});
type CompanyA_Payload = S.Schema.Type<typeof CompanyA_Payload>;

const CompanyB_Payload = S.Struct({
  person: S.String,
  company: S.String,
});
type CompanyB_Payload = S.Schema.Type<typeof CompanyB_Payload>;

const CompanyC_Payload = S.Struct({
  subject: S.Struct({ id: S.String }),
  org: S.Struct({ id: S.String }),
});
type CompanyC_Payload = S.Schema.Type<typeof CompanyC_Payload>;

type PayloadSchema =
  | { kind: "A"; schemaId: string; schema: typeof CompanyA_Payload }
  | { kind: "B"; schemaId: string; schema: typeof CompanyB_Payload }
  | { kind: "C"; schemaId: string; schema: typeof CompanyC_Payload };

const payloadRegistry: Record<string, PayloadSchema> = {
  "schema.companyA.v1/J": {
    kind: "A",
    schemaId: "schema.companyA.v1/J",
    schema: CompanyA_Payload,
  },
  "schema.companyB.v1/J": {
    kind: "B",
    schemaId: "schema.companyB.v1/J",
    schema: CompanyB_Payload,
  },
  "schema.companyC.v1/J": {
    kind: "C",
    schemaId: "schema.companyC.v1/J",
    schema: CompanyC_Payload,
  },
};

// --- Build demo hypergraph -------------------------------------------------

const buildDemoHypergraph = (): HG.Hypergraph => {
  let hg = HG.make();

  const edges: ReadonlyArray<Hedge> = [
    // Facts
    hedgeFromString("(worksAt/Pd.{so} alice/J companyA/J)")!,
    hedgeFromString("(worksAt/Pd.{so} alice/J companyB/J)")!,
    hedgeFromString("(worksAt/Pd.{so} alice/J companyC/J)")!,
    hedgeFromString("(knows/Pd.{ab} bob/J alice/J)")!,
    // Additional unstructured-text-derived facts (n-ary actions)
    hedgeFromString("(attends/Pd.{pe} alice/J neurips2025/J)")!,
    hedgeFromString("(transfers/Pd.{sor} alice/J bob/J credits/J)")!,
    hedgeFromString("(invites/Pd.{hsog} alice/J bob/J confParty/J carol/J)")!,

    // Schema references for predicates/entities
    hedgeFromString("(schemaRef/Bd.so worksAt/Pd.{so} schema.worksAt.v1/J)")!,
    hedgeFromString("(schemaRef/Bd.so knows/Pd.{ab} schema.knows.v1/J)")!,
    hedgeFromString("(schemaRef/Bd.so person/J schema.person.v1/J)")!,
    hedgeFromString("(schemaRef/Bd.so attends/Pd.{pe} schema.attend.v1/J)")!,
    hedgeFromString(
      "(schemaRef/Bd.so transfers/Pd.{sor} schema.transfer.v1/J)"
    )!,
    hedgeFromString("(schemaRef/Bd.so invites/Pd.{hsog} schema.invite.v1/J)")!,

    // API mapping: worksAt + company -> api id
    hedgeFromString(
      "(apiFor/Bd.so worksAt/Pd.{so} companyA/J api.companyA.v1/J)"
    )!,
    hedgeFromString(
      "(apiFor/Bd.so worksAt/Pd.{so} companyB/J api.companyB.v1/J)"
    )!,
    hedgeFromString(
      "(apiFor/Bd.so worksAt/Pd.{so} companyC/J api.companyC.v1/J)"
    )!,

    // Generic API mapping by predicate (no specialization)
    hedgeFromString("(apiFor/Bd.so attends/Pd.{pe} api.attend.v1/J)")!,
    hedgeFromString("(apiFor/Bd.so transfers/Pd.{sor} api.transfer.v1/J)")!,
    hedgeFromString("(apiFor/Bd.so invites/Pd.{hsog} api.invite.v1/J)")!,

    // API endpoints for api ids
    hedgeFromString(
      "(apiEndpoint/Bd.so api.companyA.v1/J https://example.com/specific/company_a/api_c)"
    )!,
    hedgeFromString(
      "(apiEndpoint/Bd.so api.companyB.v1/J https://example.com/specific/company_b/api_c)"
    )!,
    hedgeFromString(
      "(apiEndpoint/Bd.so api.companyC.v1/J https://example.com/specific/company_c/api_c)"
    )!,
    hedgeFromString(
      "(apiEndpoint/Bd.so api.attend.v1/J https://example.com/attend)"
    )!,
    hedgeFromString(
      "(apiEndpoint/Bd.so api.transfer.v1/J https://example.com/transfer)"
    )!,
    hedgeFromString(
      "(apiEndpoint/Bd.so api.invite.v1/J https://example.com/invite)"
    )!,

    // API schema refs for api ids -> payload schema ids
    hedgeFromString(
      "(apiSchemaRef/Bd.so api.companyA.v1/J schema.companyA.v1/J)"
    )!,
    hedgeFromString(
      "(apiSchemaRef/Bd.so api.companyB.v1/J schema.companyB.v1/J)"
    )!,
    hedgeFromString(
      "(apiSchemaRef/Bd.so api.companyC.v1/J schema.companyC.v1/J)"
    )!,
    hedgeFromString("(apiSchemaRef/Bd.so api.attend.v1/J schema.attend.v1/J)")!,
    hedgeFromString(
      "(apiSchemaRef/Bd.so api.transfer.v1/J schema.transfer.v1/J)"
    )!,
    hedgeFromString("(apiSchemaRef/Bd.so api.invite.v1/J schema.invite.v1/J)")!,

    // API argument role -> payload field mappings
    hedgeFromString("(apiArgMap/Bd.so api.attend.v1/J p person/J)")!,
    hedgeFromString("(apiArgMap/Bd.so api.attend.v1/J e event/J)")!,
    hedgeFromString("(apiArgMap/Bd.so api.transfer.v1/J s from/J)")!,
    hedgeFromString("(apiArgMap/Bd.so api.transfer.v1/J o to/J)")!,
    hedgeFromString("(apiArgMap/Bd.so api.transfer.v1/J r resource/J)")!,
    hedgeFromString("(apiArgMap/Bd.so api.invite.v1/J h host/J)")!,
    hedgeFromString("(apiArgMap/Bd.so api.invite.v1/J s subject/J)")!,
    hedgeFromString("(apiArgMap/Bd.so api.invite.v1/J o object/J)")!,
    hedgeFromString("(apiArgMap/Bd.so api.invite.v1/J g guests/J)")!,
  ];

  for (const e of edges) hg = HG.insert(hg, e);
  return hg;
};

// --- Resolution logic (graph-driven, no hardcoded branching) ---------------

interface ApiDescriptor {
  readonly apiId: string; // e.g., api.companyA.v1/J
  readonly endpoint: string; // URL literal held in an atom text
  readonly payloadSchemaId: string; // e.g., schema.companyA.v1/J
}

const resolveApiForWorksAt = (
  hg: HG.Hypergraph,
  companyAtomText: string
): Option.Option<ApiDescriptor> => {
  // Find api id for (worksAt, company)
  const apiBinding = HG.findByPatternWithBindings(
    hg,
    H(A("apiFor/Bd.so"), A("worksAt/Pd.{so}"), A(companyAtomText), A("?api"))
  );

  if (Chunk.isEmpty(apiBinding)) return Option.none();
  const first = Chunk.unsafeHead(apiBinding);
  const api = must(HashMap.get(first.bindings, "?api"), "api binding missing");
  if (!isAtom(api)) return Option.none();
  const apiId = api.text;

  // endpoint
  const endpoints = HG.findByPatternWithBindings(
    hg,
    H(A("apiEndpoint/Bd.so"), A(apiId), A("?url"))
  );
  if (Chunk.isEmpty(endpoints)) return Option.none();
  const epB = Chunk.unsafeHead(endpoints);
  const urlAtom = must(HashMap.get(epB.bindings, "?url"), "url missing");
  if (!isAtom(urlAtom)) return Option.none();

  // payload schema id
  const schemas = HG.findByPatternWithBindings(
    hg,
    H(A("apiSchemaRef/Bd.so"), A(apiId), A("?schema"))
  );
  if (Chunk.isEmpty(schemas)) return Option.none();
  const scB = Chunk.unsafeHead(schemas);
  const schemaAtom = must(
    HashMap.get(scB.bindings, "?schema"),
    "schema missing"
  );
  if (!isAtom(schemaAtom)) return Option.none();

  return Option.some({
    apiId,
    endpoint: urlAtom.text,
    payloadSchemaId: schemaAtom.text,
  });
};

// Create payload for a given schema id from person/company atoms
const buildPayloadFor = (
  payloadSchemaId: string,
  person: Atom,
  company: Atom
): unknown => {
  const reg = payloadRegistry[payloadSchemaId];
  if (!reg)
    throw new Error(`No payload schema registered for ${payloadSchemaId}`);
  const personId = atomRoot(person);
  const companyId = atomRoot(company);

  switch (reg.kind) {
    case "A": {
      const value: CompanyA_Payload = {
        user: personId,
        companyCode: "A",
        role: "employee",
      };
      return S.encodeSync(reg.schema)(value);
    }
    case "B": {
      const value: CompanyB_Payload = { person: personId, company: companyId };
      return S.encodeSync(reg.schema)(value);
    }
    case "C": {
      const value: CompanyC_Payload = {
        subject: { id: personId },
        org: { id: companyId },
      };
      return S.encodeSync(reg.schema)(value);
    }
  }
};

// JSON Schema printer for visibility
const toJsonSchema = (payloadSchemaId: string): unknown => {
  const reg = payloadRegistry[payloadSchemaId];
  if (!reg) return { error: `unknown schema ${payloadSchemaId}` };
  // Use Effect Schema -> JSON Schema if available in env; here, mimic minimal structure
  return {
    schemaId: payloadSchemaId,
    note: "Generated via Effect Schema in real integration",
  };
};

// Build API calls for a given person context in an order-invariant manner
interface ApiCallPlan {
  readonly endpoint: string;
  readonly payloadSchemaId: string;
  readonly jsonSchema: unknown;
  readonly payload: unknown;
}

const buildApiCallsForPersonWorksAt = (
  hg: HG.Hypergraph,
  personAtomText: string
): ReadonlyArray<ApiCallPlan> => {
  // Find all worksAt edges regardless of ordering elsewhere; the set of companies is treated as unordered
  const matches = HG.findByPatternWithBindings(
    hg,
    H(A("worksAt/Pd.{so}"), A(personAtomText), A("?company"))
  );
  if (Chunk.isEmpty(matches)) return [];

  const calls: ApiCallPlan[] = [];
  for (const { bindings } of matches) {
    const company = must(HashMap.get(bindings, "?company"), "company missing");
    if (!isAtom(company)) continue;

    const desc = resolveApiForWorksAt(hg, company.text);
    if (desc._tag === "None") continue;
    const { endpoint, payloadSchemaId } = desc.value;
    const person = A(personAtomText);
    const payload = buildPayloadFor(payloadSchemaId, person, company);
    calls.push({
      endpoint,
      payloadSchemaId,
      jsonSchema: toJsonSchema(payloadSchemaId),
      payload,
    });
  }
  return calls;
};

// --- Declarative helpers for generic planning ------------------------------

const queryOne = (
  hg: HG.Hypergraph,
  pattern: Hedge
): Option.Option<Bindings> => {
  const rs = HG.findByPatternWithBindings(hg, pattern);
  return Chunk.isEmpty(rs)
    ? Option.none()
    : Option.some(Chunk.unsafeHead(rs).bindings);
};

const queryVar = (
  hg: HG.Hypergraph,
  pattern: Hedge,
  variable: string
): Option.Option<Atom | Hedge> =>
  pipe(
    queryOne(hg, pattern),
    Option.flatMap((b) => HashMap.get(b, variable))
  );

const resolveApiByPredicate = (
  hg: HG.Hypergraph,
  predicateText: string
): Option.Option<string> =>
  pipe(
    queryVar(hg, H(A("apiFor/Bd.so"), A(predicateText), A("?api")), "?api"),
    Option.filter(isAtom),
    Option.map((a) => a.text)
  );

const resolveEndpointByApi = (
  hg: HG.Hypergraph,
  apiId: string
): Option.Option<string> =>
  pipe(
    queryVar(hg, H(A("apiEndpoint/Bd.so"), A(apiId), A("?url")), "?url"),
    Option.filter(isAtom),
    Option.map((a) => a.text)
  );

const resolveSchemaByApi = (
  hg: HG.Hypergraph,
  apiId: string
): Option.Option<string> =>
  pipe(
    queryVar(hg, H(A("apiSchemaRef/Bd.so"), A(apiId), A("?schema")), "?schema"),
    Option.filter(isAtom),
    Option.map((a) => a.text)
  );

const lettersOf = (edge: Hedge): Chunk.Chunk<string> => {
  const roles = argrolesOf(edge);
  if (!roles) return Chunk.empty();
  const flat = roles[0] === "{" ? roles.slice(1, -1) : roles;
  return Chunk.fromIterable(flat.replace(/[\s,]/g, "").split(""));
};

const argsOf = (edge: Hedge): Chunk.Chunk<Atom | Hedge> =>
  Chunk.fromIterable(edge.items.slice(1));

const fieldNameFor = (
  hg: HG.Hypergraph,
  apiId: string,
  roleLetter: string
): string =>
  pipe(
    queryVar(
      hg,
      H(A("apiArgMap/Bd.so"), A(apiId), A(roleLetter), A("?field")),
      "?field"
    ),
    Option.filter(isAtom),
    Option.map((a) => a.text.split("/")[0]),
    Option.getOrElse(() => roleLetter)
  );

const valueOf = (arg: Atom | Hedge): unknown =>
  isAtom(arg) ? arg.text.split("/")[0] : toStr(arg);

// --- Demo runner -----------------------------------------------------------

const main = Effect.gen(function* () {
  const hg = buildDemoHypergraph();

  // Show order-invariant matching: even if alice is second arg, pattern matches
  const q = hedgeFromString("(knows/Pd.{ab} ?x alice/J)")!;
  const matchesKnows = HG.findByPatternWithBindings(hg, q);
  console.log(
    "Order-invariant knows matches (expect 1: bob knows alice):",
    Chunk.size(matchesKnows)
  );

  // Build API call plans for Alice's worksAt set
  const calls = buildApiCallsForPersonWorksAt(hg, "alice/J");
  for (const c of calls) {
    console.log("--- API CALL ---");
    console.log("endpoint:", c.endpoint);
    console.log("payloadSchemaId:", c.payloadSchemaId);
    console.log("jsonSchema (simplified):", c.jsonSchema);
    console.log("payload:", c.payload);
  }

  // ----- N-ary, order-invariant actions triggered from text-derived facts -----
  // Generic predicate-driven API planning using role-to-field maps in-graph

  type GenericPlan = {
    apiId: string;
    endpoint: string;
    payloadSchemaId: string;
    payload: Record<string, unknown>;
  };

  const genericPlanForPredicate = (edge: Hedge): Option.Option<GenericPlan> => {
    const pred = connector(edge);
    if (!isAtom(pred)) return Option.none();
    const isHttps: Predicate.Predicate<string> = (s) =>
      s.startsWith("https://");
    const isSchemaId: Predicate.Predicate<string> = (s) =>
      s.startsWith("schema.");
    const invitesMinArity = Predicate.implies<unknown & Hedge>(
      (e) =>
        isAtom(connector(e)) &&
        (connector(e) as Atom).text === "invites/Pd.{hsog}",
      (e) => e.items.length - 1 >= 4
    );

    return Option.gen(function* (_) {
      const apiId = yield* _(resolveApiByPredicate(hg, pred.text));
      const endpoint = yield* _(
        pipe(
          resolveEndpointByApi(hg, apiId),
          Option.flatMap(Option.liftPredicate(isHttps))
        )
      );
      const schemaId = yield* _(
        pipe(
          resolveSchemaByApi(hg, apiId),
          Option.flatMap(Option.liftPredicate(isSchemaId))
        )
      );
      // Arity guard for specific predicates
      yield* _(Option.liftPredicate(invitesMinArity)(edge));

      const payload = pipe(
        Chunk.zip(lettersOf(edge), argsOf(edge)),
        Chunk.reduce({} as Record<string, unknown>, (acc, [letter, arg]) => {
          const field = fieldNameFor(hg, apiId, letter);
          acc[field] = valueOf(arg);
          return acc;
        })
      );
      return { apiId, endpoint, payloadSchemaId: schemaId, payload };
    });
  };

  const candidates: Hedge[] = [
    hedgeFromString("(attends/Pd.{pe} alice/J neurips2025/J)")!,
    hedgeFromString("(transfers/Pd.{sor} alice/J bob/J credits/J)")!,
    hedgeFromString("(invites/Pd.{hsog} alice/J bob/J confParty/J carol/J)")!,
  ];

  for (const e of candidates) {
    const plan = genericPlanForPredicate(e);
    if (plan._tag === "Some") {
      console.log("--- GENERIC API CALL ---");
      console.log("endpoint:", plan.value.endpoint);
      console.log("payloadSchemaId:", plan.value.payloadSchemaId);
      console.log("payload:", plan.value.payload);
    }
  }
});

// Execute
Effect.runPromise(main).catch((e) => {
  console.error(e);
  process.exit(1);
});
