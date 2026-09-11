// Snapshot machinery shared by all fixture suites (tofu, terragrunt).
//
// Every subdirectory of tests/fixtures/<name>/ that contains at least one
// *.txt file becomes a test case: each <name>.txt is read, processed through
// parse+render, and snapshot-asserted. Add a folder with txt files and it is
// picked up automatically — no per-fixture code needed.
//
// Snapshots live next to the fixtures: fixtures/<name>/<dir>/snapshot.js.snap
// (one file per fixture directory, keyed per txt stem). Jest's
// toMatchSnapshot() maps snapshots per test *file*, not per test, so this
// module hand-rolls the snapshot IO using Jest's own helpers
// (@jest/snapshot-utils); the .snap files are byte-compatible with native
// Jest snapshots and honor --ci / -u via the test file's SnapshotState.
// Because each snapshot.js.snap file is written whole-file, all mutations
// for a directory go through one cached data object and are persisted once
// in afterAll (mirrors how SnapshotState batches writes for its single file).
// tofu-snapshots.ts maps these files back to the respective test file so
// Jest's cleanup pass does not delete them on -u runs.

import * as fs from "fs";
import * as path from "path";
import {
  getSnapshotData,
  saveSnapshotFile,
  type SnapshotData,
  testNameToKey,
} from "@jest/snapshot-utils";
import type { Config } from "@jest/types";
import { processFile } from "../src";

interface Fixture {
  name: string;
  dir: string;
  txtFiles: string[];
}

interface CachedSnapshotFile {
  data: SnapshotData;
  write(): void;
}

/**
 * Build a describe block that snapshot-tests every fixture directory under
 * tests/fixtures/<fixturesDirName>/.
 */
export default function describeFixtures(fixturesDirName: string): void {
  const FIXTURES_DIR = path.join(__dirname, "fixtures", fixturesDirName);

  function discoverFixtures(): Fixture[] {
    return fs
      .readdirSync(FIXTURES_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const dir = path.join(FIXTURES_DIR, entry.name);
        const txtFiles = fs
          .readdirSync(dir)
          .filter((file) => file.endsWith(".txt"))
          .sort();
        if (txtFiles.length === 0) return null;
        return { name: entry.name, dir, txtFiles };
      })
      .filter((f): f is Fixture => f !== null);
  }

  function updateMode(): Config.SnapshotUpdateState {
    const { snapshotState } = expect.getState();
    return snapshotState ? snapshotState._updateSnapshot : "none";
  }

  // snapshotPath -> { data, write() } cache, loaded once per file.
  const snapshotFiles = new Map<string, CachedSnapshotFile>();

  function snapshotFile(snapshotPath: string): CachedSnapshotFile {
    if (!snapshotFiles.has(snapshotPath)) {
      const { data } = getSnapshotData(snapshotPath, updateMode());
      snapshotFiles.set(snapshotPath, {
        data,
        write() {
          saveSnapshotFile(data, snapshotPath);
        },
      });
    }
    return snapshotFiles.get(snapshotPath)!;
  }

  // Per-fixture snapshot assertion. Mirrors SnapshotState.match():
  // 'all' (-u) rewrites, 'new' (non-CI default) writes missing, 'none' (CI)
  // fails on missing.
  function toMatchFixtureSnapshot(
    dir: string,
    stem: string,
    received: string,
  ): void {
    const snapshotPath = path.join(dir, "snapshot.js.snap");
    const { data } = snapshotFile(snapshotPath);
    const key = testNameToKey(stem, 1);

    if (data[key] !== undefined) {
      if (data[key] !== received && updateMode() === "all") {
        data[key] = received;
      }
      expect(received).toBe(data[key]);
      return;
    }

    if (updateMode() === "none") {
      throw new Error(
        `New snapshot for "${key}" in ${snapshotPath} was not written. ` +
          "The update flag must be explicitly passed to write a new snapshot " +
          "(run with --ci=false -u).",
      );
    }

    data[key] = received;
  }

  const fixtures = discoverFixtures();

  afterAll(() => {
    for (const { write } of snapshotFiles.values()) write();
  });

  describe.each(fixtures)("$name", ({ dir, txtFiles }) => {
    test.each(txtFiles.map((file) => file.replace(/\.txt$/, "")))(
      "%s",
      (stem) => {
        const output = processFile(path.join(dir, `${stem}.txt`));
        toMatchFixtureSnapshot(dir, stem!, output);
      },
    );
  });
}
