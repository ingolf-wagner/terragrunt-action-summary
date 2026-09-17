#!/usr/bin/env node
"use strict";
// tofu-summarize CLI
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("../src/index");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const args = process.argv.slice(2);
let actionOutput = null;
let update = false;
for (let i = 0; i < args.length; i++) {
    if (args[i] === "--action-output" && i + 1 < args.length) {
        actionOutput = args[++i];
    }
    else if (args[i] === "--update") {
        update = true;
    }
}
if (!actionOutput) {
    process.stderr.write("Usage: tofu-summarize --action-output <path> [--update]\n");
    process.exit(1);
}
const summary = (0, index_1.processFile)(actionOutput);
process.stdout.write(summary);
if (update) {
    const dir = path.dirname(actionOutput);
    const snapshotPath = path.join(dir, "snapshot.md");
    fs.writeFileSync(snapshotPath, summary, "utf-8");
}
