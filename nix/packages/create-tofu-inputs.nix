# `nix run .#create-tofu-inputs` — runs every tofu stack under
# ./tofu against the locally compiled dummy provider (baked into
# opentofu via withPlugins, no registry access) and records
# apply/plan output — plain text and JSON — as jest fixture inputs in
#   <any>  : plain tofu apply + plan, one directory per stack
#
# Multi-phase stacks ("steps" convention): a stack may ship a marker file
# steps.hcl containing `max_step = N`. The marker is inert to tofu (tofu
# only auto-loads *.tf / *.tf.json); the stack itself declares
# `variable "step"` and gates resource lifecycle on the step value:
# changing the step produces in-place updates, count 1->0 destroys, and
# failing resources emit errors. The generator applies such stacks once
# per step with TF_VAR_step=<step> (1..N), each phase in the same work
# dir so tofu state accumulates — later phases then record
# updates/destroys/failures over earlier-phase resources. No terraform
# state manipulation is needed. Single-phase stacks (no steps.hcl) are
# generated exactly as before, and TF_VAR_step is never exported for
# them (tofu errors on undeclared TF_VAR_* env vars).
#
# Stacks are discovered automatically: every directory under ./tofu/
# becomes one fixture directory; adding a new folder there is all it takes.
#
# Per stack the following files are written to <fixtures>/<stack>/:
#   apply.txt  plain-text tofu apply stdout+stderr (first run);
#              multi-phase stacks instead record one file per phase:
#              apply-step1.txt ... apply-stepN.txt (run per step, in
#              order, sharing tofu state)
#   apply.json tofu apply --json NDJSON event stream (second run; one
#              JSON object per line: version, planned_change,
#              apply_start, apply_complete, apply_errored,
#              change_summary, outputs, diagnostic, ...);
#              multi-phase stacks run this as a repeat of the FINAL
#              phase (TF_VAR_step=$maxStep): a repeat of the final
#              phase is deterministic — transitions that already
#              succeeded in the final phase are no-ops on the repeat;
#              failing ones retry and fail again
#   plan.txt   tofu plan stdout+stderr (run after apply, so a no-op plan)
#   plan.json  tofu show -json of the saved plan;
#              multi-phase stacks run both with TF_VAR_step=$maxStep so
#              the plan reflects the final configuration
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
    # Multi-phase stacks (steps.hcl marker): apply once per step with
    # TF_VAR_step set so state accumulates across phases in $work.
    maxStep=1
    if [ -f "$stack/steps.hcl" ]; then
      maxStep="$(awk -F= '/^[[:space:]]*max_step/{gsub(/[^0-9]/,"",$2); print $2}' "$stack/steps.hcl")"
    fi
    [ -n "$maxStep" ] || maxStep=1
    if [ "$maxStep" -gt 1 ]; then
      step=1
      while [ "$step" -le "$maxStep" ]; do
        TF_VAR_step=$step "${tofuBinary}" -chdir="$work" apply -auto-approve ${applyFlags} 2>&1 \
          >"$fixtures/apply-step$step.txt" || true
        step=$((step + 1))
      done
    else
      "${tofuBinary}" -chdir="$work" apply -auto-approve ${applyFlags} 2>&1 \
        >"$fixtures/apply.txt" || true
    fi

    # JSON event stream: a repeat apply with -json. For multi-phase
    # stacks this repeats the FINAL phase (TF_VAR_step=$maxStep): a
    # repeat of the final phase is deterministic — transitions that
    # already succeeded in the final phase are no-ops on the repeat;
    # failing ones retry and fail again.
    if [ "$maxStep" -gt 1 ]; then
      TF_VAR_step=$maxStep "${tofuBinary}" -chdir="$work" apply -auto-approve -json ${applyFlags} 2>/dev/null \
        | sed 's/"@timestamp":"[^"]*"/"@timestamp":"redacted"/' \
        >"$fixtures/apply.json" || true
    else
      "${tofuBinary}" -chdir="$work" apply -auto-approve -json ${applyFlags} 2>/dev/null \
        | sed 's/"@timestamp":"[^"]*"/"@timestamp":"redacted"/' \
        >"$fixtures/apply.json" || true
    fi

    # Plan after apply: for multi-phase stacks use the final step value
    # so the plan reflects the final configuration.
    if [ "$maxStep" -gt 1 ]; then
      TF_VAR_step=$maxStep "${tofuBinary}" -chdir="$work" plan -out="$work/plan.tfplan" ${planFlags} 2>&1 \
        >"$fixtures/plan.txt" || true
    else
      "${tofuBinary}" -chdir="$work" plan -out="$work/plan.tfplan" ${planFlags} 2>&1 \
        >"$fixtures/plan.txt" || true
    fi

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
