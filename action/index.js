#!/usr/bin/env node
"use strict";

const { decode, parse, render } = require("../js/dist/src/index");

const encoded = process.env.INPUT_ACTION_OUTPUT;
if (!encoded) {
  console.error(
    'Missing required input "action_output". Ensure the step provides tg_action_output.',
  );
  process.exitCode = 1;
  process.exit();
}

const summaryPath = process.env.GITHUB_STEP_SUMMARY;
if (!summaryPath) {
  console.error(
    "GITHUB_STEP_SUMMARY is not set. This action must run in a GitHub Actions workflow step.",
  );
  process.exitCode = 1;
  process.exit();
}

const fs = require("fs");
if (!fs.existsSync(summaryPath)) {
  console.error(
    `GITHUB_STEP_SUMMARY points to a missing file: ${summaryPath}`,
  );
  process.exitCode = 1;
  process.exit();
}

function processEncoded(encoded) {
  const decoded = decode(encoded.trim());
  const run = parse(decoded);
  return render(run);
}

const summary = processEncoded(encoded);
fs.appendFileSync(summaryPath, summary + "\n");
