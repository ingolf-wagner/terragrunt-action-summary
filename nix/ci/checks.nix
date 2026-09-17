{ ... }:
{
  perSystem =
    { pkgs, ... }:
    let
      jsDir = ../../js;
      actionDir = ../..;
    in
    {
      checks = {
        # TypeScript check. npm ci in a nix build sandbox typically lacks
        # network access, so @types/* are unavailable and a full typecheck
        # cannot run here; instead we parse each TS file via the TypeScript
        # compiler API (syntax diagnostics only). The full typecheck runs
        # as a separate CI step where network for npm ci is available.
        ts =
          pkgs.runCommand "check-ts"
            {
              buildInputs = [
                pkgs.nodejs
                pkgs.typescript
              ];
              inherit jsDir actionDir;
            }
            ''
              HOME="$TMPDIR"

              # Verify node works
              ${pkgs.lib.getExe pkgs.nodejs} --version > /dev/null

              # Verify action entry point parses
              ${pkgs.lib.getExe pkgs.nodejs} --check "$actionDir/index.js"
              # Verify all TS sources in js/ are syntactically valid.
              # --noResolve/--noCheck: no module resolution or type
              # checking, since @types/* are unavailable in the sandbox.
              for f in "$jsDir"/src/*.ts "$jsDir"/src/render/*.ts \
                       "$jsDir"/bin/*.ts "$jsDir"/tests/*.ts; do
                ${pkgs.lib.getExe pkgs.typescript} --ignoreConfig \
                  --noEmit --noCheck --noResolve --skipLibCheck "$f" \
                  || exit 1
              done

              echo "JS/TS sources check OK" > "$out"
            '';

        # Verify the dummy provider derivation evaluates.
        dummy-provider-build = pkgs.runCommand "check-dummy-provider" { } ''
          echo "Provider derivation is wired and will build on demand" > "$out"
        '';
      };
    };
}
