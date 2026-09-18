/** Resolution for a run whose log shows a completed plan/apply summary. */
export declare const RESOLUTION: {
    readonly SUCCESS: "success";
    readonly FAILURE: "failure";
    readonly UNKNOWN: "unknown";
};
/** Whether counts describe a plan or an apply. */
export declare const COUNTS_KIND: {
    readonly PLANNED: "planned";
    readonly APPLIED: "applied";
};
export type Resolution = (typeof RESOLUTION)[keyof typeof RESOLUTION];
export type CountsKind = (typeof COUNTS_KIND)[keyof typeof COUNTS_KIND];
export type Action = "create" | "modify" | "destroy";
export type ResourceState = "completed" | "pending";
export declare const Actions: {
    readonly Create: "create";
    readonly Modify: "modify";
    readonly Destroy: "destroy";
};
export declare const ResourceStates: {
    readonly Completed: "completed";
    readonly Pending: "pending";
};
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
export declare function createUnit(module: string | null | undefined): Unit;
/** Compute total count. */
export declare function countTotal(counts: Counts): number;
