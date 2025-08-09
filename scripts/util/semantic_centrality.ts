import * as HG from "../../src/memory/Hypergraph.js";
import {
  degreeAtDepthCentrality,
  degreeCentrality,
  topK,
  normalizeScores,
  weightedDepthCentrality,
} from "../../src/analytics/Centrality.js";

export interface SemanticCentralityOptions {
  readonly roleWeights?: Readonly<Record<string, number>>;
  readonly depthWeights?: Readonly<Record<number, number>>;
}

export const semanticCentrality = (
  hg: HG.Hypergraph,
  options: SemanticCentralityOptions = {}
): Record<string, ReadonlyArray<readonly [string, number]>> => {
  const dw = options.depthWeights ?? { 1: 1, 2: 0.5, 3: 0.25 };
  const weighted = weightedDepthCentrality(hg, dw);
  const topWeighted = topK(normalizeScores(weighted), 10);
  return {
    weighted: topWeighted,
  };
};
