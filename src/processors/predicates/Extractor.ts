import { HashMap } from "effect";
import * as HG from "../../src/memory/Hypergraph.js";
import { Atom, isAtom } from "../../src/hg/model.js";
import { typeOf } from "../../src/hg/ops.js";
import { PredicateSummary, RoleHistogram, DepthHistogram } from "../types.js";

const inc = (m: Record<string, number>, k: string): void => {
  m[k] = (m[k] ?? 0) + 1;
};

export const analyzePredicates = (
  hg: HG.Hypergraph
): ReadonlyArray<PredicateSummary> => {
  const roleCounts = new Map<string, Record<string, number>>();
  const depthCounts = new Map<string, Record<number, number>>();

  // Use byHeadAtom for verb head occurrences and byRootDepth for depth
  for (const [head, set] of HashMap.entries(hg.byHeadAtom)) {
    const root = head.split("/")[0] ?? head;
    const rc = roleCounts.get(root) ?? {};
    inc(rc, "head");
    roleCounts.set(root, rc);
  }

  for (const [depth, rootMap] of HashMap.entries(hg.byRootDepth)) {
    for (const [root, set] of HashMap.entries(rootMap)) {
      const dc = depthCounts.get(root) ?? {};
      inc(dc as any, String(depth));
      depthCounts.set(root, dc);
    }
  }

  const out: PredicateSummary[] = [];
  for (const [root] of roleCounts) {
    const roles: RoleHistogram = { counts: roleCounts.get(root)! };
    const depths: DepthHistogram = { counts: depthCounts.get(root) ?? {} };
    const total = Object.values(roles.counts).reduce((a, b) => a + b, 0);
    out.push({ root, total, roles, depths });
  }
  return out.sort((a, b) => b.total - a.total);
};
