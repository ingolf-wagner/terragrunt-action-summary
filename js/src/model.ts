// Data model — typed shapes shared by parser, renderer, and CLI.

/** Resolution for a run whose log shows a completed plan/apply summary. */
export const RESOLUTION = {
  SUCCESS: "success",
  FAILURE: "failure",
  UNKNOWN: "unknown",
} as const;

/** Whether counts describe a plan or an apply. */
export const COUNTS_KIND = {
  PLANNED: "planned", // from "Plan: X to add, ..." line
  APPLIED: "applied", // from "Apply complete! Resources: ..." line
} as const;

export type Resolution = (typeof RESOLUTION)[keyof typeof RESOLUTION];
export type CountsKind = (typeof COUNTS_KIND)[keyof typeof COUNTS_KIND];

export type Action = "create" | "modify" | "destroy";
export type ResourceState = "completed" | "pending";

export const Actions = {
  Create: "create",
  Modify: "modify",
  Destroy: "destroy",
} as const satisfies Record<string, Action>;

export const ResourceStates = {
  Completed: "completed",
  Pending: "pending",
} as const satisfies Record<string, ResourceState>;

export interface Counts {
  added: number;
  changed: number;
  destroyed: number;
}

export interface Resource {
  address: string;
  action: Action;
  /** completed when a "... complete" line was seen; pending when the log ends mid-transition ("Creating..." without a completion) — the final state the log shows. */
  state: ResourceState;
  durationSeconds: number | null;
  identifier: string | null;
}

export interface Unit {
  /** Terragrunt module path, null for flat output */
  module: string | null;
  /** Final state this unit's log shows: success (summary line seen, no errors), failure (errors seen or the run stopped before a summary), unknown (nothing recognizable). */
  resolution: Resolution;
  /** Which tofu command the block reflects, inferred from the summary line seen (null if none). */
  operation: "apply" | "plan" | null;
  /** Parsed from the summary line ("Apply complete! ..." or "Plan: X to add, ...") */
  counts: Counts | null;
  /** Whether counts are planned or applied */
  countsKind: CountsKind | null;
  resources: Resource[];
  outputs: [string, string][];
  errors: string[];
}

export interface TerraformRun {
  /** One entry per terragrunt module block */
  units: Unit[];
  /** The raw decoded input */
  raw: string;
  /** Success when all units succeeded; failure when any unit errored or died before its summary; unknown when nothing recognizable was found. */
  resolution: Resolution;
}

/** Create a default Unit object. */
export function createUnit(module: string | null | undefined): Unit {
  return {
    module: module || null,
    resolution: RESOLUTION.UNKNOWN,
    operation: null,
    counts: null,
    countsKind: null,
    resources: [],
    outputs: [],
    errors: [],
  };
}

/** Compute total count. */
export function countTotal(counts: Counts): number {
  return counts.added + counts.changed + counts.destroyed;
}
