// Parser — tofu plan/apply output -> TerraformRun

import {
  type Action,
  Actions,
  type Counts,
  COUNTS_KIND,
  createUnit,
  RESOLUTION,
  type Resolution,
  ResourceStates,
  type TerraformRun,
  type Unit,
} from "./model";

// Regexes for the recognizable tofu output grammar.
const RE = {
  module: /^\s*Module\s+(\S+)\s*$/,
  applyComplete:
    /Apply complete! Resources: (\d+) added, (\d+) changed, (\d+) destroyed/,
  planSummary: /Plan: (\d+) to add, (\d+) to change, (\d+) to destroy/,
  noChanges: /No changes\. Your infrastructure matches the configuration\./,
  // Start lines for create are bare ("X: Creating..."), but real tofu
  // suffixes modifying/destroy starts with the prior id
  // ("X: Modifying... [id=y]"), so those two must not be end-anchored.
  // Destruction completions carry no id at all (the resource is gone),
  // unlike creation/modification completions.
  creating: /^(.+?): Creating\.\.\.\s*$/,
  creationDone: /^(.+?): Creation complete after (\d+)s \[id=(\S+)\]/,
  modifying: /^(.+?): Modifying\.\.\./,
  modifyDone: /^(.+?): Modifications complete after (\d+)s \[id=(\S+)\]/,
  destroying: /^(.+?): Destroying\.\.\./,
  destroyDone: /^(.+?): Destruction complete after (\d+)s(?: \[id=(\S+)\])?/,
  // Plan-phase change headers: "# <address> will be created|destroyed|updated
  // in-place" (or "must be replaced", optionally via "is tainted, so ...").
  // Data sources ("will be read during apply") and removed blocks ("will no
  // longer be managed") are intentionally unmatched — only state-changing
  // managed resources belong in the summary.
  planChange:
    /^\s*#\s+(\S+) (will be created|will be destroyed|will be updated in-place|is tainted, so must be replaced|must be replaced)\b/,
  outputsHdr: /^Outputs:\s*$/,
  // Matches real terragrunt timestamps (HH:MM:SS.mmm digits) and the
  // redacted fixture form (HH:MM:SS.mmm literal) written by normalizeTxt.
  tgUnit:
    /^(?:\d{2}|HH):(?:\d{2}|MM):(?:\d{2}|SS)\.(?:\d{3}|mmm) (?:STDOUT|STDERR) \[(\S+)\] (?:tofu|terraform): /,
  outputKV: /^(\S+) = (.*)$/,
} as const;

interface RawUnit {
  module: string | null;
  lines: string[];
}

/**
 * Split raw output into per-unit blocks. Units are delimited by terragrunt
 * "Module <name>" headers and terragrunt 1.x labeled
 * `HH:MM:SS.mmm STDOUT|STDERR [unit] tofu:` prefixes; label-less prefixed
 * output and flat tofu output yield a single null-module unit.
 */
export function splitUnits(raw: string): RawUnit[] {
  const units: RawUnit[] = [];
  let current: RawUnit = { module: null, lines: [] };

  for (const line of raw.split("\n")) {
    const tg = RE.tgUnit.exec(line);
    if (tg) {
      // "." is a single-unit run's root unit (path relative to the run
      // directory) — same as the label-less form: no module heading.
      const tgModule: string | null = tg[1] === "." ? null : tg[1] ?? null;
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
    } else {
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
export function stripPrefix(line: string): string {
  if (line.startsWith("tofu: ")) return line.slice(6);
  if (line.startsWith("terraform: ")) return line.slice(11);
  const tgMatch = line.match(
    /^(?:\d{2}|HH):(?:\d{2}|MM):(?:\d{2}|SS)\.(?:\d{3}|mmm) (?:STDOUT|STDERR|INFO|WARN|ERROR|DEBUG|TRACE)\s+(?:\[\S+\] )?(?:tofu|terraform): /,
  );
  if (tgMatch) return line.slice(tgMatch[0].length);
  return line;
}

/** Parse one unit block's lines into a Unit. */
export function parseBlock(module: string | null, lines: string[]): Unit {
  const unit = createUnit(module);
  let inOutputs = false;
  // Set once a real resource-transition line (Creating/Modifying/Destroying/
  // any completion) is seen. Gates plan-phase header parsing and separates
  // planned-pending rows (plan-only log) from stuck transitions (apply log).
  let sawTransition = false;

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
        unit.countsKind = COUNTS_KIND.APPLIED;
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
        unit.countsKind = COUNTS_KIND.PLANNED;
        unit.operation = "plan";
        inOutputs = false;
        continue;
      }
    }

    // "No changes." — a successful empty plan
    if (RE.noChanges.test(line) || RE.noChanges.test(bare)) {
      unit.counts = { added: 0, changed: 0, destroyed: 0 };
      unit.countsKind = COUNTS_KIND.PLANNED;
      unit.operation = "plan";
      inOutputs = false;
      continue;
    }

    // Outputs block
    if (RE.outputsHdr.test(line) || RE.outputsHdr.test(bare)) {
      inOutputs = true;
      continue;
    }
    if (inOutputs) {
      if (line.trim() === "") {
        // Blank line closes outputs only after >=1 entry collected
        if (unit.outputs.length > 0) {
          inOutputs = false;
        }
      } else {
        const kv = line.match(RE.outputKV) || bare.match(RE.outputKV);
        if (kv) {
          unit.outputs.push([kv[1]!, kv[2]!]);
        } else if (unit.outputs.length > 0) {
          inOutputs = false;
        }
      }
      continue;
    }

    // Plan-phase change headers ("# addr will be created", ...). Pushed as
    // pending rows so a later apply transition completes them in place; a
    // plan-only run keeps them pending, rendered with the ⏳ badge. Applied
    // only before any transition lines were seen — after apply starts, "#"
    // comment lines can no longer be plan headers.
    {
      const m = bare.match(RE.planChange);
      if (m && !sawTransition) {
        const phrase = m[2]!;
        pushPending(
          unit,
          m[1]!,
          phrase.includes("destroy")
            ? Actions.Destroy
            : phrase.includes("updated")
            ? Actions.Modify
            : Actions.Create,
        );
        continue;
      }
    }

    // Resource transitions (on bare = prefix-stripped line).
    // Start lines push a pending row; the matching completion line later
    // flips that row to completed in place (FIFO per address, so ordered
    // destroy+create pairs resolve correctly).
    {
      const m = bare.match(RE.creating);
      if (m) {
        sawTransition = true;
        pushPending(unit, m[1]!, Actions.Create);
        continue;
      }
    }
    {
      const m = bare.match(RE.creationDone);
      if (m) {
        sawTransition = true;
        pushDone(unit, m[1]!, Actions.Create, m[2]!, m[3]!);
        continue;
      }
    }
    {
      const m = bare.match(RE.modifying);
      if (m) {
        sawTransition = true;
        pushPending(unit, m[1]!, Actions.Modify);
        continue;
      }
    }
    {
      const m = bare.match(RE.modifyDone);
      if (m) {
        sawTransition = true;
        pushDone(unit, m[1]!, Actions.Modify, m[2]!, m[3]!);
        continue;
      }
    }
    {
      const m = bare.match(RE.destroying);
      if (m) {
        sawTransition = true;
        pushPending(unit, m[1]!, Actions.Destroy);
        continue;
      }
    }
    {
      const m = bare.match(RE.destroyDone);
      if (m) {
        sawTransition = true;
        pushDone(unit, m[1]!, Actions.Destroy, m[2]!, m[3]!);
        continue;
      }
    }

    // Errors: any line containing "Error:" (on the trimmed raw line)
    if (line.includes("Error:")) {
      unit.errors.push(line);
    }
  }

  // Resolve the unit's final state from what the log showed.
  unit.resolution = resolveUnit(unit, sawTransition);
  return unit;
}

/** Parse counts out of a plan/apply summary regex match. */
function parseCounts(m: RegExpMatchArray): Counts {
  return {
    added: parseInt(m[1]!, 10) || 0,
    changed: parseInt(m[2]!, 10) || 0,
    destroyed: parseInt(m[3]!, 10) || 0,
  };
}

/**
 * Final state of a unit from its parsed contents:
 *   failure - errors seen, or transitions that started but never completed
 *   success - a plan/apply summary line was seen and no errors
 *   unknown - nothing recognizable
 * Pending rows from plan-phase headers (sawTransition false) are planned
 * changes, not failures — only a pending row alongside a real transition
 * line means apply stalled mid-change.
 */
function resolveUnit(unit: Unit, sawTransition: boolean): Resolution {
  if (
    unit.errors.length > 0 ||
    (sawTransition &&
      unit.resources.some((r) => r.state === ResourceStates.Pending))
  ) {
    return RESOLUTION.FAILURE;
  }
  if (unit.counts !== null) {
    return RESOLUTION.SUCCESS;
  }
  return RESOLUTION.UNKNOWN;
}

/**
 * Push a pending (in-flight) resource transition. Dedupes against any
 * existing row for the same address+action — pending or completed: the
 * fixture generators sort consecutive transition lines lexicographically
 * for determinism, which can emit a completion line before its start line
 * (pushDone then records the completed row directly; the late start line
 * must not push a duplicate). Each (address, action) occurs at most once
 * per unit log, so this cannot mask a genuine second transition.
 */
function pushPending(unit: Unit, address: string, action: Action): void {
  if (
    unit.resources.some((r) => r.address === address && r.action === action)
  ) {
    return;
  }
  unit.resources.push({
    address,
    action,
    state: ResourceStates.Pending,
    durationSeconds: null,
    identifier: null,
  });
}

/**
 * Complete the oldest pending row for this address in place (FIFO, so
 * ordered destroy+create pairs of the same address pair up correctly);
 * with no pending row, record a completed transition directly.
 */
function pushDone(
  unit: Unit,
  address: string,
  action: Action,
  duration: string | null,
  identifier: string | null,
): void {
  let target = null;
  for (const r of unit.resources) {
    if (r.state === ResourceStates.Pending && r.address === address) {
      target = r;
      break;
    }
  }

  const completed = {
    address,
    action: target ? target.action : action,
    state: ResourceStates.Completed,
    durationSeconds: (duration !== null && duration !== undefined)
      ? parseInt(duration, 10)
      : null,
    identifier: identifier || null,
  };

  if (target) {
    // Keep the row position; flip it to completed.
    const idx = unit.resources.indexOf(target);
    unit.resources[idx] = completed;
  } else {
    unit.resources.push(completed);
  }
}

// Regex to strip ANSI escape sequences (SGR color codes only; avoids impacting CSI sequences)
const ANSI_RE = /\x1b\[[0-9;]*m/g;

/** Strip ANSI escape sequences from a string. */
function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, "");
}

/** Parse raw decoded tofu plan/apply output into the full run model. */
export function parse(raw: string): TerraformRun {
  const cleaned = stripAnsi(raw);
  const units = splitUnits(cleaned).map(({ module, lines }) =>
    parseBlock(module, lines)
  );

  const resolution = units.some((u) => u.resolution === RESOLUTION.FAILURE)
    ? RESOLUTION.FAILURE
    : units.every((u) => u.resolution === RESOLUTION.UNKNOWN)
    ? RESOLUTION.UNKNOWN
    : RESOLUTION.SUCCESS;

  return { units, raw: cleaned, resolution };
}
