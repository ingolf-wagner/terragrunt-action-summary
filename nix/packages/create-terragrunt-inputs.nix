# `nix run .#create-terragrunt-inputs` — runs every terragrunt stack under
# ./terragrunt against the locally compiled dummy provider (baked into
# opentofu via withPlugins, no registry access) and records the terragrunt
# output as jest fixture inputs in
#
#   <fixturesRoot>/<stack>/: init.txt, apply.txt, plan.txt
#
# Multi-phase stacks: a stack may ship a marker file `steps.hcl` at its root
# containing `max_step = N` (the marker is inert to terragrunt/tofu — only
# terragrunt.hcl and *.tf are loaded). Such stacks declare `variable "step"`
# in their tofu config and gate resource lifecycle on it; the generator runs
# the apply phase once per step, exporting TF_VAR_step=<step> so terragrunt
# forwards it to tofu. Because the temp copy (and its state) persists across
# phases, state simply accumulates: later phases naturally produce updates
# (value change), destroys (count 1 -> 0), and errors (fail flags). No
# terraform state manipulation is needed. These stacks record one fixture
# file per phase:
#
#   <fixturesRoot>/<stack>/: init.txt, apply-step1.txt .. apply-step<N>.txt,
#                            plan.txt (planned at TF_VAR_step=<N>, the final
#                            config)
#
# Single-phase stacks (no steps.hcl) keep the plain apply.txt/plan.txt
# fixtures and never export TF_VAR_step (tofu errors on undeclared TF_VAR_*
# env vars).
#
# Stacks are discovered automatically: every directory under ./terragrunt/
# becomes one fixture directory. A stack directory that itself contains a
# terragrunt.hcl is a single unit (run WITHOUT --all); a stack directory
# whose children contain terragrunt.hcl files is a multi-unit stack
# (run WITH --all from the stack directory).
#
# The terragrunt/ and tofu/ sources are embedded as filtered store paths:
# editing them changes the derivation and regenerates the fixtures on the
# next run.
{
  lib,
  writeShellScriptBin,
  coreutils,
  gawk,
  gnused,
  opentofu,
  terragrunt,
  dummy-provider,
}:
let
  # One fixture directory per direct subdirectory of ./terragrunt/ —
  # adding a new stack folder there requires no change to this file.
  stackNames = builtins.attrNames (
    lib.filterAttrs (_: entryType: entryType == "directory") (builtins.readDir ../../terragrunt)
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

  # Run one terragrunt stack inside a temp copy; fixtures go to
  # $fixturesRoot/<stack>/ (created here, so callers only pass the name).
  # Multi-unit stacks (child terragrunt.hcl dirs) need `run --all`; a
  # single unit is the stack directory itself and is run WITHOUT --all.
  # Under --all terragrunt appends -auto-approve itself; a plain `run`
  # prompts for approval and dies without a TTY, so -auto-approve is
  # forwarded after --.
  runTerragruntStack = stack: ''
    echo ":: generating fixtures for stack ${stack}"
    fixtures="$fixturesRoot/${stack}"
    mkdir -p "$fixtures"
    work="$(mktemp -d)"
    cleanupWorkDirs="$cleanupWorkDirs $work"
    mkdir -p "$work/terragrunt/${stack}"
    cp -r "$terragruntRoot/${stack}"/. "$work/terragrunt/${stack}/"
    # Store sources are read-only (555); terragrunt creates
    # .terragrunt-cache inside the unit dirs and tofu writes state, so
    # make the copies writable.
    chmod -R u+w "$work"

    TG="terragrunt run --tf-path ${tofuBinary} --non-interactive --no-color"
    # Multi-unit stacks have child terragrunt.hcl dirs -> --all; single-unit
    # stacks are the unit dir themselves.
    if [ -n "$(echo "$work/terragrunt/${stack}"/*/terragrunt.hcl)" ]; then
      # --parallelism=1 runs units sequentially so the stdout/stderr line
      # order across units is deterministic across runs.
      ALL="--all --parallelism=1"
      APPROVE=""
    else
      ALL=""
      APPROVE="-- -auto-approve"
    fi

    # Multi-phase stacks carry a steps.hcl marker (max_step = N) at the
    # stack root; they get one apply per step with TF_VAR_step so state
    # accumulates across phases. Single-phase stacks must NOT see
    # TF_VAR_step (tofu errors on undeclared TF_VAR_* env vars), so the
    # variable is only set inside the multi-phase branch.
    maxStep=1
    if [ -f "$work/terragrunt/${stack}/steps.hcl" ]; then
      maxStep="$(awk -F= '/^[[:space:]]*max_step/{gsub(/[^0-9]/,"",$2); print $2}' "$work/terragrunt/${stack}/steps.hcl")"
    fi
    [ -n "$maxStep" ] || maxStep=1

    ( cd "$work/terragrunt/${stack}" && $TG $ALL init ) 2>&1 | normalizeTxt >"$fixtures/init.txt" || true
    if [ "$maxStep" -gt 1 ]; then
      step=1
      while [ "$step" -le "$maxStep" ]; do
        ( cd "$work/terragrunt/${stack}" && TF_VAR_step=$step $TG $ALL apply $APPROVE ) 2>&1 | normalizeTxt >"$fixtures/apply-step$step.txt" || true
        step=$((step + 1))
      done
      ( cd "$work/terragrunt/${stack}" && TF_VAR_step=$maxStep $TG $ALL plan ) 2>&1 | normalizeTxt >"$fixtures/plan.txt" || true
    else
      ( cd "$work/terragrunt/${stack}" && $TG $ALL apply $APPROVE ) 2>&1 | normalizeTxt >"$fixtures/apply.txt" || true
      ( cd "$work/terragrunt/${stack}" && $TG $ALL plan ) 2>&1 | normalizeTxt >"$fixtures/plan.txt" || true
    fi
  '';

  # Only the stack sources (.hcl plus the vendored .tf modules) belong in
  # the store path; state dirs or plugin caches from local runs must not
  # leak into the fixtures.
  terragruntSources = lib.fileset.toSource {
    root = ../../terragrunt;
    fileset = lib.fileset.fileFilter (file: file.hasExt "hcl" || file.hasExt "tf") ../../terragrunt;
  };
in
writeShellScriptBin "create-terragrunt-inputs" ''
  set -eu
  export PATH="${
    lib.makeBinPath [
      coreutils
      gawk
      gnused
      terragrunt
    ]
  }:$PATH"

  normalizeTxt() {
    sed -E \
      -e 's/^[0-9][0-9]:[0-9][0-9]:[0-9][0-9]\.[0-9][0-9][0-9] /HH:MM:SS.mmm /' \
      -e 's#\.terragrunt-cache/[A-Za-z0-9_-]+/\.#.terragrunt-cache/HASH/.#g' \
      -e 's#\.terragrunt-cache/[A-Za-z0-9_-]+/#.terragrunt-cache/HASH/#g' \
      -e 's#(\.terragrunt-cache/HASH/)[A-Za-z0-9_-]+#\1HASH#g' \
      -e 's#/tmp/tmp\.[A-Za-z0-9]+/terragrunt/[A-Za-z0-9_-]+#.#g' \
      -e 's/after [0-9]+s \[/after 0s [/' \
      -e 's/ [0-9]+ms$/ Nms/' \
      -e 's/[0-9]+µs/ Nµs/' \
    | awk '
      function flush() {
        runLength = asort(run, sortedRun)
        for (i = 1; i <= runLength; i++) print sortedRun[i]
        split("", run)
        runLength = 0
      }
      /(STDOUT|STDERR) (\[[^]]+\] )?tofu: [^:]+: (Creating|Creation|Destroying|Destruction|Modifying|Modifications|Reading|Reading complete|Refreshing|Refreshing complete)/ {
        run[++runLength] = $0
        next
      }
      { flush(); print }
      END { flush() }
    '
  }

  # terragrunt working copies; cleaned up on exit.
  cleanupWorkDirs=""
  trap 'chmod -R u+w $cleanupWorkDirs; rm -rf $cleanupWorkDirs' EXIT

  # Read-only store copy of the stack sources; per run it is copied into
  # a writable temp dir (terragrunt writes .terragrunt-cache inside the
  # unit dirs and tofu writes .terraform state).
  terragruntRoot="$(mktemp -d)"; cleanupWorkDirs="$cleanupWorkDirs $terragruntRoot"
  cp -r "${terragruntSources}"/. "$terragruntRoot"/

  fixturesRoot="''${1:-js/tests/fixtures/terragrunt}"

  ${lib.concatStrings (map runTerragruntStack stackNames)}

  echo ":: fixtures written to $fixturesRoot"
''
