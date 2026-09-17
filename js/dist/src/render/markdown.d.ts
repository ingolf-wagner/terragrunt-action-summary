import { type Resolution, type TerraformRun, type Unit } from "../model";
export declare function splitModulePrefix(address: string): [string | null, string];
/**
 * Render a single unit's section body (module heading, counts line,
 * resource table). Caller renders the run-level heading.
 */
export declare function renderUnit(unit: Unit): string;
/** Render full markdown summary from parsed units. */
export declare function renderMarkdown(units: Unit[], resolution: Resolution): string;
/**
 * Render a TerraformRun into markdown.
 * Structured summary in every case; the raw dump remains only as the
 * last resort when nothing at all was recognized.
 */
export declare function render(run: TerraformRun): string;
