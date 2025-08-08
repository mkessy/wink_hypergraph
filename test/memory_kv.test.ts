import { describe, it, expect } from "vitest";
import { atom, hedge } from "../src/hg/model.js";
import * as KV from "../src/memory/KeyValue.js";
import { toStr } from "../src/hg/print.js";

describe("memory KeyValue", () => {
  it("insert/remove/has/values and prefix & pattern search", () => {
    let kv = KV.make();
    const e1 = hedge([atom("+/B/."), atom("plays/Pd.{so}"), atom("mary/C")]);
    const e2 = hedge([atom("+/B/."), atom("eats/Pd.{so}"), atom("john/C")]);
    const e3 = hedge([atom("+/B/."), atom("plays/Pd.{so}"), atom("john/C")]);

    kv = KV.insert(kv, e1);
    kv = KV.insert(kv, e2);
    kv = KV.insert(kv, e3);

    expect(KV.size(kv)).toBe(3);
    expect(KV.has(kv, e1)).toBe(true);
    expect(KV.values(kv).map(toStr).length).toBe(3);

    // prefix
    const prefix = toStr(atom("+/B/."));
    expect(KV.findByPrefix(kv, prefix).length).toBe(3);

    // pattern
    const pattern = hedge([atom("+/B/."), atom("*"), atom("john/C")]);
    expect(KV.findByPattern(kv, pattern).map(toStr).sort()).toEqual(
      [e2, e3].map(toStr).sort()
    );

    kv = KV.remove(kv, e2);
    expect(KV.size(kv)).toBe(2);
  });
});
