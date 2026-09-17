"use strict";
// Parser — tofu plan/apply output -> TerraformRun
Object.defineProperty(exports, "__esModule", { value: true });
exports.splitUnits = splitUnits;
exports.stripPrefix = stripPrefix;
exports.parseBlock = parseBlock;
exports.parse = parse;
const model_1 = require("./model");
// Regexes for the recognizable tofu output grammar.
const RE = {
    module: /^\s*Module\s+(\S+)\s*$/,
    applyComplete: /Apply complete! Resources: (\d+) added, (\d+) changed, (\d+) destroyed/,
    planSummary: /Plan: (\d+) to add, (\d+) to change, (\d+) to destroy/,
    noChanges: /No changes\. Your infrastructure matches the configuration\./,
    creating: /^(.+?): Creating\.\.\.\s*$/,
    creationDone: /^(.+?): Creation complete after (\d+)s \[id=(\S+)\]/,
    modifying: /^(.+?): Modifying\.\.\.\s*$/,
    modifyDone: /^(.+?): Modifications complete after (\d+)s \[id=(\S+)\]/,
    destroying: /^(.+?): Destroying\.\.\.\s*$/,
    destroyDone: /^(.+?): Destruction complete after (\d+)s \[id=(\S+)\]/,
    reading: /^(.+?): Reading\.\.\.\s*$/,
    readDone: /^(.+?): Read complete after (\d+)s/,
    outputsHdr: /^Outputs:\s*$/,
    // Matches real terragrunt timestamps (HH:MM:SS.mmm digits) and the
    // redacted fixture form (HH:MM:SS.mmm literal) written by normalizeTxt.
    tgUnit: /^(?:\d{2}|HH):(?:\d{2}|MM):(?:\d{2}|SS)\.(?:\d{3}|mmm) (?:STDOUT|STDERR) \[(\S+)\] (?:tofu|terraform): /,
    outputKV: /^(\S+) = (.*)$/,
};
/**
 * Split raw output into per-unit blocks. Units are delimited by terragrunt
 * "Module <name>" headers and terragrunt 1.x labeled
 * `HH:MM:SS.mmm STDOUT|STDERR [unit] tofu:` prefixes; label-less prefixed
 * output and flat tofu output yield a single null-module unit.
 */
function splitUnits(raw) {
    const units = [];
    let current = { module: null, lines: [] };
    for (const line of raw.split("\n")) {
        const tg = RE.tgUnit.exec(line);
        if (tg) {
            // "." is a single-unit run's root unit (path relative to the run
            // directory) — same as the label-less form: no module heading.
            const tgModule = tg[1] === "." ? null : tg[1] ?? null;
            if (tgModule !== current.module) {
                if (current.lines.length > 0 || current.module !== null) {
                    units.push(current);
                }
                current = { module: tgModule, lines: [] };
            }
            current.lines.push(stripPrefix(line));
            continue;
        }
        const m = RE.module.exec(line);
        if (m) {
            if (current.lines.length > 0 || current.module !== null) {
                units.push(current);
            }
            current = { module: m[1] ?? null, lines: [] };
        }
        else {
            current.lines.push(line);
        }
    }
    if (current.lines.length > 0 || current.module !== null) {
        units.push(current);
    }
    if (units.length === 0) {
        units.push({ module: null, lines: [] });
    }
    return units;
}
/**
 * Strip the tofu/terraform log prefix from a line (used for resource-transition matching only).
 * Handles the terragrunt 1.x run-all prefix with a unit label
 * (`HH:MM:SS.mmm STDOUT|STDERR [unit] tofu: `) and the label-less
 * single-unit form without one.
 */
function stripPrefix(line) {
    if (line.startsWith("tofu: "))
        return line.slice(6);
    if (line.startsWith("terraform: "))
        return line.slice(11);
    const tgMatch = line.match(/^(?:\d{2}|HH):(?:\d{2}|MM):(?:\d{2}|SS)\.(?:\d{3}|mmm) (?:STDOUT|STDERR) (?:\[\S+\] )?(?:tofu|terraform): /);
    if (tgMatch)
        return line.slice(tgMatch[0].length);
    return line;
}
/** Parse one unit block's lines into a Unit. */
function parseBlock(module, lines) {
    const unit = (0, model_1.createUnit)(module);
    let inOutputs = false;
    for (const rawLine of lines) {
        // Trim trailing whitespace per line (Rust: line.trim_end())
        const line = rawLine.trimEnd();
        // Bare line for resource-transition matching (prefix stripped)
        const bare = stripPrefix(line);
        // Module header on raw line -> skip (already split)
        if (RE.module.test(line)) {
            continue;
        }
        // Apply summary line: ends outputs block, provides applied counts
        {
            const m = line.match(RE.applyComplete) || bare.match(RE.applyComplete);
            if (m) {
                unit.counts = parseCounts(m);
                unit.countsKind = model_1.COUNTS_KIND.APPLIED;
                unit.operation = "apply";
                inOutputs = false;
                continue;
            }
        }
        // Plan summary line: provides planned counts
        {
            const m = line.match(RE.planSummary) || bare.match(RE.planSummary);
            if (m) {
                unit.counts = parseCounts(m);
                unit.countsKind = model_1.COUNTS_KIND.PLANNED;
                unit.operation = "plan";
                inOutputs = false;
                continue;
            }
        }
        // "No changes." — a successful empty plan
        if (RE.noChanges.test(line) || RE.noChanges.test(bare)) {
            unit.counts = { added: 0, changed: 0, destroyed: 0 };
            unit.countsKind = model_1.COUNTS_KIND.PLANNED;
            unit.operation = "plan";
            inOutputs = false;
            continue;
        }
        // Outputs block
        if (RE.outputsHdr.test(line)) {
            inOutputs = true;
            continue;
        }
        if (inOutputs) {
            if (line.trim() === "") {
                // Blank line closes outputs only after >=1 entry collected
                if (unit.outputs.length > 0) {
                    inOutputs = false;
                }
            }
            else {
                const kv = line.match(RE.outputKV);
                if (kv) {
                    unit.outputs.push([kv[1], kv[2]]);
                }
                else if (unit.outputs.length > 0) {
                    inOutputs = false;
                }
            }
            continue;
        }
        // Resource transitions (on bare = prefix-stripped line).
        // Start lines push a pending row; the matching completion line later
        // flips that row to completed in place (FIFO per address, so ordered
        // destroy+create pairs resolve correctly).
        {
            const m = bare.match(RE.creating);
            if (m) {
                pushPending(unit, m[1], model_1.Actions.Create);
                continue;
            }
        }
        {
            const m = bare.match(RE.creationDone);
            if (m) {
                pushDone(unit, m[1], model_1.Actions.Create, m[2], m[3]);
                continue;
            }
        }
        {
            const m = bare.match(RE.modifying);
            if (m) {
                pushPending(unit, m[1], model_1.Actions.Modify);
                continue;
            }
        }
        {
            const m = bare.match(RE.modifyDone);
            if (m) {
                pushDone(unit, m[1], model_1.Actions.Modify, m[2], m[3]);
                continue;
            }
        }
        {
            const m = bare.match(RE.destroying);
            if (m) {
                pushPending(unit, m[1], model_1.Actions.Destroy);
                continue;
            }
        }
        {
            const m = bare.match(RE.destroyDone);
            if (m) {
                pushDone(unit, m[1], model_1.Actions.Destroy, m[2], m[3]);
                continue;
            }
        }
        {
            const m = bare.match(RE.reading);
            if (m) {
                pushPending(unit, m[1], model_1.Actions.Read);
                continue;
            }
        }
        {
            const m = bare.match(RE.readDone);
            if (m) {
                pushDone(unit, m[1], model_1.Actions.Read, m[2], null);
                continue;
            }
        }
        // Errors: any line containing "Error:" (on the trimmed raw line)
        if (line.includes("Error:")) {
            unit.errors.push(line);
        }
    }
    // Resolve the unit's final state from what the log showed.
    unit.resolution = resolveUnit(unit);
    return unit;
}
/** Parse counts out of a plan/apply summary regex match. */
function parseCounts(m) {
    return {
        added: parseInt(m[1], 10) || 0,
        changed: parseInt(m[2], 10) || 0,
        destroyed: parseInt(m[3], 10) || 0,
    };
}
/**
 * Final state of a unit from its parsed contents:
 *   failure - errors seen, or resource transitions that never completed
 *   success - a plan/apply summary line was seen and no errors
 *   unknown - nothing recognizable
 */
function resolveUnit(unit) {
    if (unit.errors.length > 0 ||
        unit.resources.some((r) => r.state === model_1.ResourceStates.Pending)) {
        return model_1.RESOLUTION.FAILURE;
    }
    if (unit.counts !== null) {
        return model_1.RESOLUTION.SUCCESS;
    }
    return model_1.RESOLUTION.UNKNOWN;
}
/** Push a pending (in-flight) resource transition, deduping repeats. */
function pushPending(unit, address, action) {
    const dup = unit.resources.some((r) => r.state === model_1.ResourceStates.Pending && r.address === address &&
        r.action === action);
    if (dup) {
        return;
    }
    unit.resources.push({
        address,
        action,
        state: model_1.ResourceStates.Pending,
        durationSeconds: null,
        identifier: null,
    });
}
/**
 * Complete the oldest pending row for this address in place (FIFO, so
 * ordered destroy+create pairs of the same address pair up correctly);
 * with no pending row, record a completed transition directly.
 */
function pushDone(unit, address, action, duration, identifier) {
    let target = null;
    for (const r of unit.resources) {
        if (r.state === model_1.ResourceStates.Pending && r.address === address) {
            target = r;
            break;
        }
    }
    const completed = {
        address,
        action: target ? target.action : action,
        state: model_1.ResourceStates.Completed,
        durationSeconds: (duration !== null && duration !== undefined)
            ? parseInt(duration, 10)
            : null,
        identifier: identifier || null,
    };
    if (target) {
        // Keep the row position; flip it to completed.
        const idx = unit.resources.indexOf(target);
        unit.resources[idx] = completed;
    }
    else {
        unit.resources.push(completed);
    }
}
// Regex to strip ANSI escape sequences (SGR color codes only; avoids impacting CSI sequences)
const ANSI_RE = /\x1b\[[0-9;]*m/g;
/** Strip ANSI escape sequences from a string. */
function stripAnsi(text) {
    return text.replace(ANSI_RE, "");
}
/** Parse raw decoded tofu plan/apply output into the full run model. */
function parse(raw) {
    const cleaned = stripAnsi(raw);
    const units = splitUnits(cleaned).map(({ module, lines }) => parseBlock(module, lines));
    const resolution = units.some((u) => u.resolution === model_1.RESOLUTION.FAILURE)
        ? model_1.RESOLUTION.FAILURE
        : units.every((u) => u.resolution === model_1.RESOLUTION.UNKNOWN)
            ? model_1.RESOLUTION.UNKNOWN
            : model_1.RESOLUTION.SUCCESS;
    return { units, raw: cleaned, resolution };
}
