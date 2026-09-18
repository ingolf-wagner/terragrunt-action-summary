"use strict";
// tofu-summarize — main exports
var __createBinding = (this && this.__createBinding) ||
  (Object.create
    ? (function (o, m, k, k2) {
      if (k2 === undefined) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (
        !desc ||
        ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)
      ) {
        desc = {
          enumerable: true,
          get: function () {
            return m[k];
          },
        };
      }
      Object.defineProperty(o, k2, desc);
    })
    : (function (o, m, k, k2) {
      if (k2 === undefined) k2 = k;
      o[k2] = m[k];
    }));
var __setModuleDefault = (this && this.__setModuleDefault) ||
  (Object.create
    ? (function (o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    })
    : function (o, v) {
      o["default"] = v;
    });
var __importStar = (this && this.__importStar) || (function () {
  var ownKeys = function (o) {
    ownKeys = Object.getOwnPropertyNames || function (o) {
      var ar = [];
      for (var k in o) {
        if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
      }
      return ar;
    };
    return ownKeys(o);
  };
  return function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) {
      for (
        var k = ownKeys(mod), i = 0;
        i < k.length;
        i++
      ) if (k[i] !== "default") __createBinding(result, mod, k[i]);
    }
    __setModuleDefault(result, mod);
    return result;
  };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.render = exports.parse = void 0;
exports.decode = decode;
exports.processFile = processFile;
const parser_1 = require("./parser");
Object.defineProperty(exports, "parse", {
  enumerable: true,
  get: function () {
    return parser_1.parse;
  },
});
const markdown_1 = require("./render/markdown");
Object.defineProperty(exports, "render", {
  enumerable: true,
  get: function () {
    return markdown_1.render;
  },
});
const fs = __importStar(require("fs"));
/**
 * Lenient percent-decode: decode %XX byte-by-byte into a Uint8Array, then
 * decode as UTF-8. If invalid UTF-8 or invalid sequences, keep the
 * offending text as-is.
 */
function decode(encoded) {
  const trimmed = encoded.trim();
  const bytes = [];
  let i = 0;
  const len = trimmed.length;
  while (i < len) {
    if (trimmed[i] === "%" && i + 2 < len) {
      const hi = trimmed[i + 1];
      const lo = trimmed[i + 2];
      if (isHex(hi) && isHex(lo)) {
        bytes.push(parseInt(trimmed.substring(i + 1, i + 3), 16));
        i += 3;
        continue;
      }
    }
    // Encode non-%XX characters as UTF-8 bytes
    const encodedChar = new TextEncoder().encode(trimmed[i]);
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
function isHex(ch) {
  return (ch >= "0" && ch <= "9") || (ch >= "a" && ch <= "f") ||
    (ch >= "A" && ch <= "F");
}
/** Read a file, trim, decode, parse, and render to markdown. */
function processFile(path) {
  const content = fs.readFileSync(path, "utf-8");
  const decoded = decode(content);
  return (0, markdown_1.render)((0, parser_1.parse)(decoded));
}
