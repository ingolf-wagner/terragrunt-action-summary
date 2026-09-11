#!/usr/bin/env node
// tofu-summarize CLI

import { processFile } from "../src/index";
import * as path from "path";
import * as fs from "fs";

const args = process.argv.slice(2);
let actionOutput: string | null = null;
let update = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--action-output" && i + 1 < args.length) {
    actionOutput = args[++i]!;
  } else if (args[i] === "--update") {
    update = true;
  }
}

if (!actionOutput) {
  process.stderr.write(
    "Usage: tofu-summarize --action-output <path> [--update]\n",
  );
  process.exit(1);
}

const summary = processFile(actionOutput);
process.stdout.write(summary);

if (update) {
  const dir = path.dirname(actionOutput);
  const snapshotPath = path.join(dir, "snapshot.md");
  fs.writeFileSync(snapshotPath, summary, "utf-8");
}
