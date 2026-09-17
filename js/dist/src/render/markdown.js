"use strict";
// Markdown renderer — TerraformRun -> GitHub step summary
Object.defineProperty(exports, "__esModule", { value: true });
exports.splitModulePrefix = splitModulePrefix;
exports.renderUnit = renderUnit;
exports.renderMarkdown = renderMarkdown;
exports.render = render;
const model_1 = require("../model");
// Action icons
const ICONS = {
    create: "✍️",
    modify: "👷",
    destroy: "🔥",
    read: "🔍",
};
// Resolution badges
const RESOLUTION_BADGE = {
    success: "✅",
    failure: "❌",
    unknown: "❓",
};
// Resource final-state badges
const STATE_BADGE = {
    completed: "✔",
    pending: "⏳",
};
function splitModulePrefix(address) {
    let end = 0; // index of the '.' separating module path from resource
    let segmentStart = 0;
    while (address.startsWith("module.", segmentStart)) {
        // Skip the `module.` keyword, then scan to the segment separator
        let depth = 0;
        let scanIndex = segmentStart + 7; // length of "module."
        while (scanIndex < address.length) {
            const ch = address[scanIndex];
            if (ch === "[")
                depth++;
            else if (ch === "]")
                depth--;
            else if (ch === "." && depth === 0)
                break;
            scanIndex++;
        }
        if (scanIndex >= address.length || address[scanIndex] !== ".") {
            break;
        }
        end = scanIndex;
        segmentStart = scanIndex + 1;
    }
    if (end === 0) {
        return [null, address];
    }
    return [address.slice(0, end), address.slice(end + 1)];
}
/**
 * Render a single unit's section body (module heading, counts line,
 * resource table). Caller renders the run-level heading.
 */
function renderUnit(unit) {
    let summary = "";
    if (unit.module !== null) {
        summary += `### ${unit.module}\n`;
    }
    if (unit.counts !== null) {
        const total = (0, model_1.countTotal)(unit.counts);
        if (total === 0) {
            summary += "**No changes.**\n";
        }
        else if (unit.countsKind === "planned") {
            summary +=
                `**Plan:** ${unit.counts.added} to add, ${unit.counts.changed} to change, ${unit.counts.destroyed} to destroy.\n`;
        }
        else {
            summary +=
                `**Resources:** ${unit.counts.added} added, ${unit.counts.changed} changed, ${unit.counts.destroyed} destroyed.\n`;
        }
    }
    if (unit.resources.length > 0) {
        // Group by leading module path, first-appearance order; unprefixed first.
        const groups = [];
        for (const resource of unit.resources) {
            const [modulePath] = splitModulePrefix(resource.address);
            const existing = groups.find(([p]) => p === modulePath);
            if (existing) {
                existing[1].push(resource);
            }
            else {
                groups.push([modulePath, [resource]]);
            }
        }
        const items = [];
        for (const [modulePath, group] of groups) {
            if (modulePath !== null) {
                items.push("");
                items.push(`**\`${modulePath}\`**\n`);
            }
            else if (items.length > 0) {
                items.push("");
            }
            items.push("| resource | action | state | time |");
            items.push("| --- | --- | --- | --- |");
            for (const resource of group) {
                const [, remainder] = splitModulePrefix(resource.address);
                let cell = `\`${remainder}\``;
                if (resource.identifier !== null) {
                    cell += ` (id=${resource.identifier})`;
                }
                const time = resource.durationSeconds !== null
                    ? `${resource.durationSeconds}s`
                    : "";
                items.push(`| ${cell} | ${ICONS[resource.action]} | ${STATE_BADGE[resource.state]} | ${time} |`);
            }
        }
        summary += `\n${items.join("\n")}\n`;
    }
    // Errors block at bottom of the unit
    if (unit.errors.length > 0) {
        summary += `\n**${unit.errors.length} error(s):**\n\n\`\`\`\n${unit.errors.join("\n")}\n\`\`\`\n`;
    }
    return summary;
}
/** Render full markdown summary from parsed units. */
function renderMarkdown(units, resolution) {
    let summary = `## Tofu Summary ${RESOLUTION_BADGE[resolution]}\n\n`;
    const multipleUnits = units.length > 1 ||
        (units.length > 0 && units[0].module !== null);
    // Aggregate counts across units (all units share the same countsKind by
    // construction; unknown units contribute nothing).
    const total = { added: 0, changed: 0, destroyed: 0 };
    let countsKind = null;
    for (const unit of units) {
        if (unit.counts !== null) {
            total.added += unit.counts.added;
            total.changed += unit.counts.changed;
            total.destroyed += unit.counts.destroyed;
            countsKind = countsKind || unit.countsKind;
        }
    }
    if (multipleUnits) {
        for (const unit of units) {
            const body = renderUnit(unit);
            if (body) {
                summary += body + (body.endsWith("\n") ? "\n" : "");
            }
        }
        if (countsKind !== null) {
            const grand = (0, model_1.countTotal)(total);
            if (grand > 0) {
                summary += countsKind === "planned"
                    ? `**Total (planned):** ${total.added} to add, ${total.changed} to change, ${total.destroyed} to destroy.\n`
                    : `**Total:** ${total.added} added, ${total.changed} changed, ${total.destroyed} destroyed.\n`;
            }
        }
    }
    else {
        summary += renderUnit(units[0]);
    }
    return summary;
}
/**
 * Render a TerraformRun into markdown.
 * Structured summary in every case; the raw dump remains only as the
 * last resort when nothing at all was recognized.
 */
function render(run) {
    const nothingRecognized = run.units.every((u) => u.resolution === model_1.RESOLUTION.UNKNOWN);
    if (!nothingRecognized) {
        return renderMarkdown(run.units, run.resolution);
    }
    // Raw fallback
    let summary = "## Tofu Summary ❓\n\n**Raw output (unparsed):**\n\n```\n";
    summary += run.raw;
    if (!run.raw.endsWith("\n")) {
        summary += "\n";
    }
    summary += "```\n";
    return summary;
}
