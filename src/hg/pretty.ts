import * as Doc from "@effect/printer/Doc";
import * as Layout from "@effect/printer/Layout";
import * as PageWidth from "@effect/printer/PageWidth";
import { pipe } from "effect";
import { Atom, Hedge, isAtom } from "./model.js";
import { toStr } from "./print.js";

export interface PrettyOptions {
  readonly indent?: number; // spaces
  readonly width?: number; // page width
}

// Functional helpers using printer combinators
const parensHeadArgs = (
  head: Doc.Doc<unknown>,
  args: ReadonlyArray<Doc.Doc<unknown>>,
  indent: number
): Doc.Doc<unknown> =>
  Doc.group(
    Doc.encloseSep(
      Doc.text("("),
      Doc.text(")"),
      Doc.line
    )([head, ...args]).pipe((d) => Doc.nest(d, indent))
  );

const docOfAtom = (a: Atom): Doc.Doc<unknown> => Doc.text(toStr(a));

export const docOf = (e: Atom | Hedge, indent = 2): Doc.Doc<unknown> =>
  isAtom(e)
    ? docOfAtom(e)
    : parensHeadArgs(
        docOf(e.items[0] as any, indent),
        e.items.slice(1).map((it) => docOf(it as any, indent)),
        indent
      );

export const prettyPrint = (
  e: Atom | Hedge,
  options: PrettyOptions = {}
): string => {
  const width = options.width ?? 80;
  const indent = options.indent ?? 2;
  const doc = docOf(e, indent);
  return Doc.render(doc, { style: "pretty", options: { lineWidth: width } });
};
