import { createHash } from "node:crypto";

export type Hash = string; // hex-encoded sha256

// Canonical JSON stringify: stable key ordering and no whitespace differences
export const canonicalStringify = (value: unknown): string => {
  const seen = new WeakSet<object>();
  const serialize = (v: any): any => {
    if (v === null || typeof v !== "object") return v;
    if (seen.has(v)) return "[Circular]";
    seen.add(v);
    if (Array.isArray(v)) return v.map(serialize);
    const keys = Object.keys(v).sort();
    const out: Record<string, any> = {};
    for (const k of keys) out[k] = serialize(v[k]);
    return out;
  };
  return JSON.stringify(serialize(value));
};

export const computeHash = (payload: unknown): Hash => {
  const json = canonicalStringify(payload);
  return createHash("sha256").update(json).digest("hex");
};
