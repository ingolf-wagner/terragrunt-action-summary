import { parse } from "./parser";
import { render } from "./render/markdown";
/**
 * Lenient percent-decode: decode %XX byte-by-byte into a Uint8Array, then
 * decode as UTF-8. If invalid UTF-8 or invalid sequences, keep the
 * offending text as-is.
 */
export declare function decode(encoded: string): string;
/** Read a file, trim, decode, parse, and render to markdown. */
export declare function processFile(path: string): string;
export { parse, render };
