{ inputs, ... }:
{

  imports = [ inputs.devshell.flakeModule ];

  perSystem =
    {
      pkgs,
      system,
      ...
    }:
    let
      # Run from the repo root, like `nix develop -c test-integration`.
      test-integration = pkgs.writeShellApplication {
        name = "test-integration";

        runtimeInputs = [ pkgs.nodejs ];

        text = ''
          cd js

          if [ ! -d node_modules ]; then
            npm ci --no-fund --no-audit
          fi

          node node_modules/jest/bin/jest.js --selectProjects integration
        '';
      };
      dummy-provider-opentofu = pkgs.callPackage ../packages/dummy-provider.nix {
        providerAddress = "registry.opentofu.org/dummy/dummy";
      };
    in
    {
      devshells.default = {
        commands = [
          {
            help = "run JS tests with Jest";
            name = "test";
            command = "cd js && npm ci 2>/dev/null && npx jest";
          }
          {
            help = "run integration tests with Jest (apply real tofu stacks via the dummy provider)";
            name = "test-integration";
            package = test-integration;
          }
          {
            help = "build the dummy tofu provider";
            name = "build-provider";
            command = "nix build .#dummy-provider";
          }
          {
            help = "check nix code formatting";
            name = "fmt";
            command = "nix fmt";
          }
        ];
        packages = [
          pkgs.nodejs
          pkgs.go
          pkgs.actionlint
          dummy-provider-opentofu
        ];
      };
    };
}
