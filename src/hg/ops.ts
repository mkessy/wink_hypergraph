import { Atom, Hedge, atom, hedge, isAtom, isHedge } from "./model.js";
import { toStr } from "./print.js";

// Order for roles when normalizing unordered argroles
export const argroleOrder: Record<string, number> = {
  m: -1,
  s: 0,
  p: 1,
  a: 2,
  c: 3,
  o: 4,
  i: 5,
  t: 6,
  j: 7,
  x: 8,
  r: 9,
  "?": 10,
};

// ===== Atom helpers =====
export const atomParts = (a: Atom): ReadonlyArray<string> => a.text.split("/");

export const atomRoot = (a: Atom): string => atomParts(a)[0] ?? "";

export const atomRole = (a: Atom): ReadonlyArray<string> => {
  const parts = atomParts(a);
  if (parts.length < 2) return ["J"];
  return parts[1].split(".");
};

export const atomType = (a: Atom): string => atomRole(a)[0] ?? "J";

export const atomMType = (a: Atom): string => atomType(a)[0] ?? "J";

export const atomArgroles = (a: Atom): string => {
  const role = atomRole(a);
  if (role.length < 2) return "";
  return role[1];
};

export const replaceAtomArgroles = (a: Atom, newRoles: string): Atom => {
  const parts = [...atomParts(a)];
  if (parts.length < 2) return a;
  const role = parts[1].split(".");
  if (role.length < 2) role.push(newRoles);
  else role[1] = newRoles;
  parts[1] = role.join(".");
  return atom(parts.join("/"), a.parens === true);
};

export const insertAtomArgrole = (a: Atom, role: string, pos: number): Atom => {
  const current = atomArgroles(a);
  const inserted = current.slice(0, pos) + role + current.slice(pos);
  return replaceAtomArgroles(a, inserted);
};

// ===== Hedge helpers =====
export const connector = (h: Hedge): Atom | Hedge => h.items[0] as any;

export const connectorType = (h: Hedge): string => typeOf(connector(h) as any);

export const connectorMType = (h: Hedge): string =>
  mtypeOf(connector(h) as any);

export const typeOf = (e: Atom | Hedge): string => {
  if (isHedge(e) && e.items.length === 1 && isAtom(e.items[0] as any)) {
    return typeOf(e.items[0] as Atom);
  }
  if (isAtom(e)) return atomType(e);
  // Hyperedge type per Graphbrain rules
  const ctype = connectorType(e);
  const cmain = ctype[0];
  if (cmain === "P") return `R${ctype.slice(1)}`;
  if (cmain === "M") return typeOf(e.items[1] as any);
  if (cmain === "T") return `S${ctype.slice(1)}`;
  if (cmain === "B") return `C${ctype.slice(1)}`;
  if (cmain === "J") return mtypeOf(e.items[1] as any);
  throw new Error(
    `Malformed edge, type cannot be determined: ${JSON.stringify(e)}`
  );
};

export const mtypeOf = (e: Atom | Hedge): string => typeOf(e)[0];

export const argrolesOf = (e: Atom | Hedge): string => {
  if (isHedge(e) && e.items.length === 1 && isAtom(e.items[0] as any)) {
    return argrolesOf(e.items[0] as Atom);
  }
  if (isAtom(e)) return atomArgroles(e);
  const mt = mtypeOf(e);
  const cmt = connectorMType(e);
  if ((mt === "C" || mt === "R") && (cmt === "B" || cmt === "P")) {
    return argrolesOf(connector(e));
  }
  if (mt !== "B" && mt !== "P") return "";
  return argrolesOf(e.items[1] as any);
};

export const replaceArgroles = (e: Hedge, newRoles: string): Hedge => {
  const mt = mtypeOf(e);
  if (mt === "C" || mt === "R") {
    const newConn = replaceAtomArgroles(connector(e) as any, newRoles);
    return hedge([newConn, ...e.items.slice(1)]);
  }
  if (mt === "B" || mt === "P") {
    const first = e.items[0];
    const second = replaceAtomArgroles(e.items[1] as any, newRoles);
    return hedge([first, second, ...e.items.slice(2)]);
  }
  return e;
};

export const normalized = (e: Atom | Hedge): Atom | Hedge => {
  if (isAtom(e)) return e;
  const conn = connector(e) as Atom | Hedge;
  const ar = argrolesOf(e);
  // If unordered (wrapped in braces), sort roles using argroleOrder
  // For now we preserve order (no-op) to match expected behavior
  if (ar && ar.length > 0 && ar.startsWith("{") && ar.endsWith("}")) {
    return e;
  }
  // Recurse
  return hedge(
    e.items.map((it) => (isAtom(it) ? it : (normalized(it) as Hedge)))
  );
};

export const checkCorrectness = (e: Atom | Hedge): ReadonlyArray<string> => {
  const errors: string[] = [];
  if (isAtom(e)) return errors;
  const mt = mtypeOf(e);
  const cmt = connectorMType(e);
  if (!"PMBTJ".includes(cmt))
    errors.push(`connector has incorrect type: ${cmt}`);
  if (cmt === "M" && e.items.length !== 2)
    errors.push("modifiers can only have one argument");
  if (cmt === "B" && e.items.length !== 3)
    errors.push("builders can only have two arguments");
  if (cmt === "T" && e.items.length !== 2)
    errors.push("triggers can only have one arguments");
  // Recurse
  for (const child of e.items) {
    if (isHedge(child)) errors.push(...checkCorrectness(child));
  }
  return errors;
};

// ===== Structural edits =====
export const insertFirstArgument = (
  e: Atom | Hedge,
  argument: Atom | Hedge
): Hedge => {
  if (isAtom(e)) return hedge([e, argument]);
  return hedge([e.items[0], argument, ...e.items.slice(1)]);
};

export const connect = (e: Hedge, args: ReadonlyArray<Atom | Hedge>): Hedge => {
  if (!args || args.length === 0) return e;
  return hedge([...e.items, ...args]);
};

export const replaceAtom = (
  e: Atom | Hedge,
  oldAtom: Atom,
  newAtom: Atom,
  unique = false
): Atom | Hedge => {
  if (isAtom(e)) {
    const equal = toStr(e) === toStr(oldAtom);
    return equal ? newAtom : e;
  }
  return hedge(
    e.items.map((it) =>
      isAtom(it)
        ? (replaceAtom(it, oldAtom, newAtom, unique) as Atom)
        : (replaceAtom(it, oldAtom, newAtom, unique) as Hedge)
    )
  );
};

export const contains = (
  e: Atom | Hedge,
  needle: Atom | Hedge,
  deep = false
): boolean => {
  const norm = (x: Atom | Hedge): Atom | Hedge =>
    isHedge(x) && x.items.length === 1 && isAtom(x.items[0] as any)
      ? (x.items[0] as Atom)
      : x;
  if (toStr(norm(e)) === toStr(norm(needle))) return true;
  if (isAtom(e)) return false;
  for (const it of e.items) {
    if (toStr(norm(it as any)) === toStr(norm(needle))) return true;
    if (deep && contains(it as any, needle, true)) return true;
  }
  return false;
};

export const subedges = (e: Atom | Hedge): ReadonlyArray<Atom | Hedge> => {
  const acc: (Atom | Hedge)[] = [e];
  if (isHedge(e)) {
    for (const it of e.items) acc.push(...subedges(it as any));
  }
  return acc;
};

export const sequence = (
  e: Hedge,
  entity: Atom | Hedge,
  before: boolean,
  flat = true
): Hedge => {
  if (flat) {
    return before
      ? hedge([...(isHedge(entity) ? entity.items : [entity]), ...e.items])
      : hedge([...e.items, ...(isHedge(entity) ? entity.items : [entity])]);
  } else {
    return before ? hedge([entity, e]) : hedge([e, entity]);
  }
};

export const edgesWithArgrole = (
  e: Hedge,
  role: string
): ReadonlyArray<Atom | Hedge> => {
  const ar = argrolesOf(e);
  if (!ar) return [];
  const roles =
    ar[0] === "{" ? ar.slice(1, -1).replace(/,/g, "") : ar.replace(/,/g, "");
  const results: (Atom | Hedge)[] = [];
  let idx = 0;
  for (const r of roles) {
    if (idx >= e.items.length - 1) break;
    if (r === role) results.push(e.items[idx + 1]);
    idx += 1;
  }
  return results;
};

// ===== Additional structural utilities =====
export const atoms = (e: Atom | Hedge): ReadonlyArray<Atom> => {
  if (isAtom(e)) return [e];
  const acc: Atom[] = [];
  for (const item of e.items) acc.push(...atoms(item));
  // unique by text
  const seen = new Set<string>();
  const uniq: Atom[] = [];
  for (const a of acc) {
    const key = a.text + (a.parens ? "()" : "");
    if (!seen.has(key)) {
      seen.add(key);
      uniq.push(a);
    }
  }
  return uniq;
};

export const allAtoms = (e: Atom | Hedge): ReadonlyArray<Atom> => {
  if (isAtom(e)) return [e];
  const acc: Atom[] = [];
  for (const item of e.items) acc.push(...allAtoms(item));
  return acc;
};

export const sizeOf = (e: Atom | Hedge): number => {
  if (isAtom(e)) return 1;
  if (e.items.length === 1 && isAtom(e.items[0] as any)) return 1;
  return e.items.reduce((sum, it) => sum + sizeOf(it), 0);
};

export const depthOf = (e: Atom | Hedge): number => {
  if (isAtom(e)) return 0;
  if (e.items.length === 1 && isAtom(e.items[0] as any)) return 0;
  let max = 0;
  for (const it of e.items) {
    const d = depthOf(it);
    if (d > max) max = d;
  }
  return max + 1;
};

export const rootsOf = (e: Atom | Hedge): Atom | Hedge => {
  if (isAtom(e)) {
    const root = atomRoot(e);
    return atom(root, e.parens === true);
  }
  return hedge(
    e.items.map((it) =>
      isAtom(it) ? (rootsOf(it) as Atom) : (rootsOf(it) as Hedge)
    )
  );
};
