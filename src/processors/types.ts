import { HashMap } from "effect";

export interface RoleHistogram {
  readonly counts: Readonly<Record<string, number>>;
}

export interface DepthHistogram {
  readonly counts: Readonly<Record<number, number>>;
}

export interface EntitySummary {
  readonly root: string;
  readonly total: number;
  readonly roles: RoleHistogram;
  readonly depths: DepthHistogram;
}

export interface PredicateSummary {
  readonly root: string;
  readonly total: number;
  readonly roles: RoleHistogram;
  readonly depths: DepthHistogram;
}
