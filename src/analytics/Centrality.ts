import { Chunk, HashMap, HashSet } from "effect";
import * as HG from "../memory/Hypergraph.js";

export type Root = string;
export type Score = number;

export const degreeCentrality = (
  hg: HG.Hypergraph
): HashMap.HashMap<Root, Score> => {
  let out = HashMap.empty<Root, Score>();
  for (const [root, set] of HashMap.entries(hg.byRoot)) {
    out = HashMap.set(out, root, HashSet.size(set));
  }
  return out;
};

export const degreeAtDepthCentrality = (
  hg: HG.Hypergraph,
  depth: number
): HashMap.HashMap<Root, Score> => {
  const depthMapOpt = HashMap.get(hg.byRootDepth, depth);
  if (depthMapOpt._tag === "None") return HashMap.empty();
  const m = depthMapOpt.value;
  let out = HashMap.empty<Root, Score>();
  for (const [root, set] of HashMap.entries(m)) {
    out = HashMap.set(out, root, HashSet.size(set));
  }
  return out;
};

export const weightedDepthCentrality = (
  hg: HG.Hypergraph,
  weights: Readonly<Record<number, number>>
): HashMap.HashMap<Root, Score> => {
  let out = HashMap.empty<Root, Score>();
  for (const [depth, depthMap] of HashMap.entries(hg.byRootDepth)) {
    const w = weights[depth] ?? 0;
    if (w === 0) continue;
    for (const [root, set] of HashMap.entries(depthMap)) {
      const prev = HashMap.get(out, root);
      const add = w * HashSet.size(set);
      out = HashMap.set(
        out,
        root,
        (prev._tag === "Some" ? prev.value : 0) + add
      );
    }
  }
  return out;
};

export const topK = (
  scores: HashMap.HashMap<Root, Score>,
  k: number
): Chunk.Chunk<readonly [Root, Score]> => {
  const arr: Array<readonly [Root, Score]> = [];
  for (const [root, score] of HashMap.entries(scores)) arr.push([root, score]);
  arr.sort((a, b) => b[1] - a[1]);
  return Chunk.fromIterable(arr.slice(0, k));
};

export const normalizeScores = (
  scores: HashMap.HashMap<Root, Score>
): HashMap.HashMap<Root, number> => {
  let max = 0;
  for (const [, v] of HashMap.entries(scores)) if (v > max) max = v;
  if (max === 0) return scores as any;
  let out = HashMap.empty<Root, number>();
  for (const [k, v] of HashMap.entries(scores))
    out = HashMap.set(out, k, v / max);
  return out;
};
