# `nix run .#create-tofu-inputs` — runs every tofu stack under
# ./tofu against the locally compiled dummy provider (baked into
# opentofu via withPlugins, no registry access) and records
# apply/plan output — plain text and JSON — as jest fixture inputs in
#
#   <any>  : plain tofu apply + plan, one directory per stack
#
# Stacks are discovered automatically: every directory under ./tofu/
# becomes one fixture directory; adding a new folder there is all it takes.
#
# Per stack the following files are written to <fixtures>/<stack>/:
#   apply.txt  plain-text tofu apply stdout+stderr (first run)
#   apply.json tofu apply --json NDJSON event stream (second run; one
#              JSON object per line: version, planned_change,
#              apply_start, apply_complete, apply_errored,
#              change_summary, outputs, diagnostic, ...)
#   plan.txt   tofu plan stdout+stderr (run after apply, so a no-op plan)
#   plan.json  tofu show -json of the saved plan
#
# The tofu/ stacks are embedded as a filtered store path: editing them
# changes the derivation and regenerates the fixtures on the next run.
{
  lib,
  writeShellScriptBin,
  coreutils,
  gawk,
  gnused,
  opentofu,
  dummy-provider,
}:
let
  # One fixture directory per direct subdirectory of ./tofu/ —
  # adding a new stack folder there requires no change to this file.
  stackNames = builtins.attrNames (
    lib.filterAttrs (_: entryType: entryType == "directory") (builtins.readDir ../../tofu)
  );
  # opentofu with the local dummy provider baked in: withPlugins wires
  # NIX_TERRAFORM_PLUGIN_DIR (and rewrites the provider registry dir to
  # registry.opentofu.org) so no provider downloads happen at runtime.
  # The caller MUST pass the opentofu-addressed provider variant
  # (providerAddress = "registry.opentofu.org/dummy/dummy"): the binary
  # announces its address at the plugin handshake and tofu locks on the
  # announced address — a registry.terraform.io-addressed binary makes
  # every apply fail with "Inconsistent dependency lock file".
  tofuWithDummyProvider = opentofu.withPlugins (_: [ dummy-provider ]);

  tofuBinary = "${tofuWithDummyProvider}/bin/tofu";

  commonTofuFlags = "-no-color -input=false";

  # -parallelism=1 applies resources sequentially so the stdout/stderr line
  # order is deterministic across runs.
  applyFlags = "${commonTofuFlags} -parallelism=1";
  planFlags = commonTofuFlags;

  # Run one plain-tofu stack inside a temp copy; fixtures go to
  # $fixturesRoot/<stack>/ (created here, so callers only pass the name).
  runPlainStack = stackName: ''
    echo ":: generating fixtures for stack ${stackName}"
    stack="${tofuStacks}/${stackName}"
    fixtures="$fixturesRoot/${stackName}"
    mkdir -p "$fixtures"
    work="$(mktemp -d)"
    cleanupWorkDirs="$cleanupWorkDirs $work"
    cp "$stack"/* "$work"/

    "${tofuBinary}" -chdir="$work" init ${commonTofuFlags} >/dev/null

    # First apply (plain text): creates the resources. The dummy provider
    # is idempotent, so a second run records the same events.
    "${tofuBinary}" -chdir="$work" apply -auto-approve ${applyFlags} 2>&1 \
      >"$fixtures/apply.txt" || true

    "${tofuBinary}" -chdir="$work" apply -auto-approve -json ${applyFlags} 2>/dev/null \
      | sed 's/"@timestamp":"[^"]*"/"@timestamp":"redacted"/' \
      >"$fixtures/apply.json" || true

    "${tofuBinary}" -chdir="$work" plan -out="$work/plan.tfplan" ${planFlags} 2>&1 \
      >"$fixtures/plan.txt" || true
    if [ -f "$work/plan.tfplan" ]; then
      "${tofuBinary}" -chdir="$work" show -json "$work/plan.tfplan" \
        | sed 's/"timestamp":"[^"]*"/"timestamp":"redacted"/' \
        >"$fixtures/plan.json"
    fi
  '';

  # Only the stack sources (.tf/.hcl) belong in the store path; state dirs
  # or plugin caches from local runs must not leak into the fixtures.
  tofuStacks = lib.fileset.toSource {
    root = ../../tofu;
    fileset = lib.fileset.fileFilter (file: file.hasExt "tf" || file.hasExt "hcl") ../../tofu;
  };
in
writeShellScriptBin "create-tofu-inputs" ''
  set -eu
  export PATH="${
    lib.makeBinPath [
      coreutils
      gawk
      gnused
    ]
  }:$PATH"

  # Tofu walks its graph concurrently, so the order in which
  # per-resource transition lines ("Creating...", "Creation complete",
  # "Refreshing state...", ...) appear is not stable across runs even with
  # -parallelism=1. Sort every maximal run of such consecutive lines so the
  # captured fixtures are deterministic; all other output is emitted as-is.
  normalizeTxt() {
    awk '
      function flush() {
        runLength = asort(run, sortedRun)
        for (i = 1; i <= runLength; i++) print sortedRun[i]
        split("", run)
        runLength = 0
      }
      /^([^:]+): (Creating|Creation|Destroying|Destruction|Modifying|Modifications|Reading|Refreshing)/ {
        run[++runLength] = $0
        next
      }
      { flush(); print }
      END { flush() }
    '
  }

  # tofu working copies; cleaned up on exit.
  cleanupWorkDirs=""
  trap 'chmod -R u+w $cleanupWorkDirs; rm -rf $cleanupWorkDirs' EXIT

  fixturesRoot="''${1:-js/tests/fixtures/tofu}"

  ${lib.concatStrings (map runPlainStack stackNames)}

  echo ":: fixtures written to $fixturesRoot"
''
