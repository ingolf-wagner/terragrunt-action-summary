// Custom Jest snapshot resolver.
//
// The snapshots for tofu.test.ts are hand-rolled inside the test (one
// snapshot.js.snap per fixtures/tofu/<dir>/ — Jest's toMatchSnapshot can
// only write one file per test file). This resolver exists for two reasons:
//
// 1. Jest's snapshot cleanup pass (jest-snapshot `cleanup`) globs every
//    *.snap file in the project, maps it back to a test path, and DELETES
//    it with `-u` when that test file does not exist. Mapping the fixture
//    snapshots to tests/tofu.test.ts keeps them alive.
// 2. testPathForConsistencyCheck is required by Jest 30, and the roundtrip
//    resolveTestPath(resolveSnapshotPath(x)) === x must hold for it.
//
// resolveSnapshotPath keeps the default __snapshots__/ layout — it is only
// used for the consistency check; no native snapshots are written.

import * as path from "path";

const TOFU_TEST = path.join(__dirname, "tofu.test.ts");
const TERRAGRUNT_TEST = path.join(__dirname, "terragrunt.test.ts");
const FIXTURE_SNAP_RE = /fixtures[./](?:tofu|terragrunt)[./].*\.snap$/;

const resolver: import("jest-snapshot").SnapshotResolver = {
  resolveSnapshotPath(testPath: string, snapshotExtension?: string): string {
    return path.join(
      path.dirname(testPath),
      "__snapshots__",
      path.basename(testPath) + snapshotExtension,
    );
  },

  resolveTestPath(snapshotPath: string, snapshotExtension?: string): string {
    if (FIXTURE_SNAP_RE.test(snapshotPath)) {
      return snapshotPath.includes(path.sep + "terragrunt" + path.sep)
        ? TERRAGRUNT_TEST
        : TOFU_TEST;
    }
    return path.join(
      path.dirname(path.dirname(snapshotPath)),
      path.basename(snapshotPath, snapshotExtension),
    );
  },

  testPathForConsistencyCheck: TOFU_TEST,
};

export default resolver;
