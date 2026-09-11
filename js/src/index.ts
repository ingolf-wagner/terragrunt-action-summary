// tofu-summarize — main exports

import { parse } from "./parser";
import { render } from "./render/markdown";
import * as fs from "fs";

/**
 * Lenient percent-decode: decode %XX byte-by-byte into a Uint8Array, then
 * decode as UTF-8. If invalid UTF-8 or invalid sequences, keep the
 * offending text as-is.
 */
export function decode(encoded: string): string {
  const trimmed = encoded.trim();
  const bytes: number[] = [];
  let i = 0;
  const len = trimmed.length;

  while (i < len) {
    if (trimmed[i] === "%" && i + 2 < len) {
      const hi = trimmed[i + 1]!;
      const lo = trimmed[i + 2]!;
      if (isHex(hi) && isHex(lo)) {
        bytes.push(parseInt(trimmed.substring(i + 1, i + 3), 16));
        i += 3;
        continue;
      }
    }
    // Encode non-%XX characters as UTF-8 bytes
    const encodedChar = new TextEncoder().encode(trimmed[i]!);
    for (const byte of encodedChar) {
      bytes.push(byte);
    }
    i++;
  }

  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    return decoder.decode(new Uint8Array(bytes));
  } catch {
    return trimmed;
  }
}

function isHex(ch: string): boolean {
  return (ch >= "0" && ch <= "9") || (ch >= "a" && ch <= "f") ||
    (ch >= "A" && ch <= "F");
}

/** Read a file, trim, decode, parse, and render to markdown. */
export function processFile(path: string): string {
  const content = fs.readFileSync(path, "utf-8");
  const decoded = decode(content);
  return render(parse(decoded));
}

export { parse, render };
