import { type TerraformRun, type Unit } from "./model";
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
export declare function splitUnits(raw: string): RawUnit[];
/**
 * Strip the tofu/terraform log prefix from a line (used for resource-transition matching only).
 * Handles the terragrunt 1.x run-all prefix with a unit label
 * (`HH:MM:SS.mmm STDOUT|STDERR [unit] tofu: `) and the label-less
 * single-unit form without one.
 */
export declare function stripPrefix(line: string): string;
/** Parse one unit block's lines into a Unit. */
export declare function parseBlock(module: string | null, lines: string[]): Unit;
/** Parse raw decoded tofu plan/apply output into the full run model. */
export declare function parse(raw: string): TerraformRun;
export {};
