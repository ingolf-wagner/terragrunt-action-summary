// SPDX-License-Identifier: MPL-2.0
package main

import (
	"context"
	"flag"
	"github.com/dummy/terraform-provider-dummy/internal/provider"
	"github.com/hashicorp/terraform-plugin-framework/providerserver"
	"log"
)

// Overridden at build time via -ldflags "-X main.address=..." so the same
// source can serve both registry hosts (hashicorp terraform and opentofu).
var address = "registry.terraform.io/dummy/dummy"

func main() {
	var debug bool

	flag.BoolVar(&debug, "debug", false, "set to true to run the provider with support for debuggers like delve")
	flag.Parse()
	opts := providerserver.ServeOpts{
		Address: address,
		Debug:   debug,
	}

	err := providerserver.Serve(context.Background(), provider.New, opts)
	if err != nil {
		log.Fatal(err)
	}
}
