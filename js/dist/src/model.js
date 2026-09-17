"use strict";
// Data model — typed shapes shared by parser, renderer, and CLI.
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResourceStates = exports.Actions = exports.COUNTS_KIND = exports.RESOLUTION = void 0;
exports.createUnit = createUnit;
exports.countTotal = countTotal;
/** Resolution for a run whose log shows a completed plan/apply summary. */
exports.RESOLUTION = {
    SUCCESS: "success",
    FAILURE: "failure",
    UNKNOWN: "unknown",
};
/** Whether counts describe a plan or an apply. */
exports.COUNTS_KIND = {
    PLANNED: "planned", // from "Plan: X to add, ..." line
    APPLIED: "applied", // from "Apply complete! Resources: ..." line
};
exports.Actions = {
    Create: "create",
    Modify: "modify",
    Destroy: "destroy",
    Read: "read",
};
exports.ResourceStates = {
    Completed: "completed",
    Pending: "pending",
};
/** Create a default Unit object. */
function createUnit(module) {
    return {
        module: module || null,
        resolution: exports.RESOLUTION.UNKNOWN,
        operation: null,
        counts: null,
        countsKind: null,
        resources: [],
        outputs: [],
        errors: [],
    };
}
/** Compute total count. */
function countTotal(counts) {
    return counts.added + counts.changed + counts.destroyed;
}
