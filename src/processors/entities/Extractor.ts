import { HashMap } from "effect";
import * as HG from "../../src/memory/Hypergraph.js";
import { Atom, isAtom } from "../../src/hg/model.js";
import { argrolesOf, typeOf } from "../../src/hg/ops.js";
import { EntitySummary, RoleHistogram, DepthHistogram } from "../types.js";

const inc = (m: Record<string, number>, k: string): void => {
  m[k] = (m[k] ?? 0) + 1;
};

export interface EntityOptions {
  readonly includeProper?: boolean;
}

export const analyzeEntities = (
  hg: HG.Hypergraph,
  options: EntityOptions = {}
): ReadonlyArray<EntitySummary> => {
  const roleCounts = new Map<string, Record<string, number>>();
  const depthCounts = new Map<string, Record<number, number>>();
  const totals = new Map<string, number>();

  // Iterate depth-aware index
  for (const [depth, rootMap] of HashMap.entries(hg.byRootDepth)) {
    for (const [root, set] of HashMap.entries(rootMap)) {
      // Only consider C* types if desired: approximate via root filters later
      totals.set(
        root,
        (totals.get(root) ?? 0) +
          HashMap.size(
            HashMap.fromIterable(
              HashMap.entries(HashMap.empty<string, never>())
            )
          )
      );
      const dc = depthCounts.get(root) ?? {};
      inc(dc as any, String(depth));
      depthCounts.set(root, dc);
    }
  }
  // Roles via byArgrole and byArgRootN
  for (let pos = 1; pos <= 5; pos++) {
    const inner = HashMap.get(hg.byArgRootN, pos);
    if (inner._tag === "None") continue;
    for (const [root, set] of HashMap.entries(inner.value)) {
      const rc = roleCounts.get(root) ?? {};
      inc(rc, String(pos));
      roleCounts.set(root, rc);
    }
  }

  const out: EntitySummary[] = [];
  for (const [root] of roleCounts) {
    const roles: RoleHistogram = { counts: roleCounts.get(root)! };
    const depths: DepthHistogram = { counts: depthCounts.get(root) ?? {} };
    const total = Object.values(roles.counts).reduce((a, b) => a + b, 0);
    out.push({ root, total, roles, depths });
  }
  return out.sort((a, b) => b.total - a.total);
};
