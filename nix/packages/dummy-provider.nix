{
  buildGoModule,
  lib,
  stdenv,
  # Provider address the binary announces at the plugin handshake. Must
  # match the registry host the consuming terraform/tofu resolves for
  # `source = "dummy/dummy"`: "registry.terraform.io/dummy/dummy" for
  # hashicorp terraform, "registry.opentofu.org/dummy/dummy" for opentofu.
  providerAddress ? "registry.terraform.io/dummy/dummy",
}:
buildGoModule rec {
  pname = "terraform-provider-dummy";
  version = "1.0.0";
  src = ../../providers/dummy;
  vendorHash = "sha256-nawrq3e7npwjOuksemPeGNqT166OY/j+98ebXBrAAfs=";
  subPackages = [ "." ];

  ldflags = [
    "-s"
    "-w"
    "-X main.address=${providerAddress}"
  ];

  # Install into the nixpkgs terraform provider layout so that
  # pkgs.terraform.withPlugins (p: [ p.dummy ]) can consume this derivation
  # directly (see nixpkgs pkgs/by-name/te/terraform/package.nix).
  postInstall = ''
    platform="${stdenv.hostPlatform.go.GOOS}_${stdenv.hostPlatform.go.GOARCH}"
    providerDir="$out/libexec/terraform-providers/${providerAddress}/${version}/$platform"
    mkdir -p "$providerDir"
    cp "$out/bin/terraform-provider-dummy" \
      "$providerDir/terraform-provider-dummy_v${version}"
  '';

  passthru.provider-source-address = providerAddress;

  meta = with lib; {
    description = "Dummy Terraform provider for testing the tofu-summarize action";
    license = licenses.mpl20;
    platforms = platforms.linux ++ platforms.darwin;
  };
}
