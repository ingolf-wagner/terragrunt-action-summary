{
  description = "Description for the project";

  inputs = {
    flake-parts.url = "github:hercules-ci/flake-parts";
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs =
    inputs@{ flake-parts, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } {

      imports = [
        inputs.flake-parts.flakeModules.partitions
      ];

      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];

      # Outputs are only built when the named partition is loaded. Consumers
      # of this flake as a dependency will not see these inputs.
      partitionedAttrs.checks = "ci";
      partitionedAttrs.formatter = "ci";
      partitionedAttrs.devShells = "dev";

      # CI partition: lightweight inputs needed by CI runs (formatter checks,
      # website renderers, ...). Loaded by `nix flake check` / `nix fmt`.
      partitions.ci = {
        extraInputsFlake = ./nix/ci;
        module = {
          imports = [
            ./nix/ci/formatter.nix
            ./nix/ci/checks.nix
          ];
        };
      };

      # Dev partition: everything a human needs interactively. Loaded by
      # `nix develop`. Inherits CI inputs implicitly via partitionedAttrs.
      partitions.dev = {
        extraInputsFlake = ./nix/dev;
        module = {
          imports = [
            ./nix/dev/devshells.nix
          ];
        };
      };

      perSystem =
        {
          config,
          self',
          inputs',
          pkgs,
          system,
          ...
        }:
        let
          dummy-provider = pkgs.callPackage ./nix/packages/dummy-provider.nix { };
          dummy-provider-opentofu = pkgs.callPackage ./nix/packages/dummy-provider.nix {
            providerAddress = "registry.opentofu.org/dummy/dummy";
          };

          create-tofu-inputs = pkgs.callPackage ./nix/packages/create-tofu-inputs.nix {
            inherit (pkgs) opentofu;
            dummy-provider = dummy-provider-opentofu;
          };

          create-terragrunt-inputs = pkgs.callPackage ./nix/packages/create-terragrunt-inputs.nix {
            inherit (pkgs) opentofu terragrunt;
            dummy-provider = dummy-provider-opentofu;
          };
        in
        {
          # Per-system attributes can be defined here. The self' and inputs'
          packages = {
            inherit dummy-provider dummy-provider-opentofu;
            inherit create-tofu-inputs create-terragrunt-inputs;
            tests = pkgs.writeShellApplication {
              name = "js-tests";
              runtimeInputs = [ pkgs.nodejs ];
              text = ''
                # Run from the repo root, like `nix run .#tests`.
                cd js

                # The nix store can't hold node_modules; fetch it on demand.
                if [ ! -d node_modules ]; then
                  npm ci --no-fund --no-audit
                fi

                exec node node_modules/jest/bin/jest.js "$@"
              '';
            };
            default = dummy-provider;
          };
        };
      flake = {
        # The usual flake attributes can be defined here, including system-
        # agnostic ones like nixosModule and system-enumerating ones, although
        # those are more easily expressed in perSystem.
      };
    };
}
