// SPDX-License-Identifier: MPL-2.0
package provider

import (
	"context"

	"github.com/hashicorp/terraform-plugin-framework/datasource"
	"github.com/hashicorp/terraform-plugin-framework/provider"
	"github.com/hashicorp/terraform-plugin-framework/resource"
)

var _ provider.Provider = &dummyProvider{}

type dummyProvider struct{}

func New() provider.Provider {
	return &dummyProvider{}
}

func (p *dummyProvider) Metadata(_ context.Context, _ provider.MetadataRequest, resp *provider.MetadataResponse) {
	resp.TypeName = "dummy"
}

func (p *dummyProvider) Schema(_ context.Context, _ provider.SchemaRequest, _ *provider.SchemaResponse) {
	// No provider-level schema
}

func (p *dummyProvider) Configure(_ context.Context, _ provider.ConfigureRequest, _ *provider.ConfigureResponse) {
	// No provider-level configuration
}

func (p *dummyProvider) DataSources(_ context.Context) []func() datasource.DataSource {
	return []func() datasource.DataSource{
		newValueDataSource,
	}
}

func (p *dummyProvider) Resources(_ context.Context) []func() resource.Resource {
	return []func() resource.Resource{
		newThingResource,
	}
}
