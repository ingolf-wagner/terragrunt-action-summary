{ inputs, ... }:
{
  imports = [ inputs.treefmt-nix.flakeModule ];

  perSystem = _: {
    treefmt = {
      # https://flake.parts/options/treefmt-nix < for all options
      projectRootFile = ".git/config";
      programs.nixfmt.enable = true;
      programs.deno.enable = true;
      # apply.json fixtures are tofu apply --json NDJSON event streams
      # (one JSON object per line), not single JSON documents.
      settings.formatter.deno.excludes = [
        "js/tests/fixtures/tofu/*/apply.json"
      ];
    };
  };
}
