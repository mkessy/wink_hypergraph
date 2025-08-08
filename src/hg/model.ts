import { Schema as S, Data } from "effect";

// Type identifiers, aligning with Effect style (e.g., String module)
export const AtomTypeId: unique symbol = Symbol.for("wink_hg/Atom");
export type AtomTypeId = typeof AtomTypeId;
export const HedgeTypeId: unique symbol = Symbol.for("wink_hg/Hedge");
export type HedgeTypeId = typeof HedgeTypeId;

export interface Atom {
  readonly [AtomTypeId]?: true;
  readonly kind: "atom";
  readonly text: string;
  readonly parens?: boolean;
}

export interface Hedge {
  readonly [HedgeTypeId]?: true;
  readonly kind: "hedge";
  readonly items: ReadonlyArray<Atom | Hedge>;
}

export const AtomSchema = S.Data(
  S.Struct({
    kind: S.Literal("atom"),
    text: S.String,
  })
);

export const HedgeSchema = S.Data(
  S.Struct({
    kind: S.Literal("hedge"),
    items: S.Array(
      S.Union(
        AtomSchema,
        S.suspend((): S.Schema<Hedge> => HedgeSchema)
      )
    ),
  })
);

export const atom = (text: string, parens = false): Atom =>
  Data.struct<Atom>({
    [AtomTypeId]: true,
    kind: "atom",
    text,
    ...(parens ? { parens } : {}),
  });

export const hedge = (items: ReadonlyArray<Atom | Hedge>): Hedge =>
  Data.struct<Hedge>({
    [HedgeTypeId]: true,
    kind: "hedge",
    items,
  });

export const isAtom = (e: Atom | Hedge): e is Atom =>
  (e as any)?.kind === "atom";
export const isHedge = (e: Atom | Hedge): e is Hedge =>
  (e as any)?.kind === "hedge";
