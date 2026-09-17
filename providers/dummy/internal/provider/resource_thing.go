// SPDX-License-Identifier: MPL-2.0
package provider

import (
	"context"
	"fmt"

	"github.com/hashicorp/terraform-plugin-framework/diag"
	"github.com/hashicorp/terraform-plugin-framework/resource"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/booldefault"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/planmodifier"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/stringdefault"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/stringplanmodifier"
	"github.com/hashicorp/terraform-plugin-framework/types"
)

var _ resource.Resource = &thingResource{}

type thingResource struct{}

type thingResourceModel struct {
	ID         types.String `tfsdk:"id"`
	Name       types.String `tfsdk:"name"`
	Value      types.String `tfsdk:"value"`
	Fail       types.Bool   `tfsdk:"fail"`
	FailUpdate types.Bool   `tfsdk:"fail_update"`
	FailDelete types.Bool   `tfsdk:"fail_delete"`
}

func newThingResource() resource.Resource {
	return &thingResource{}
}

func (r *thingResource) Metadata(_ context.Context, req resource.MetadataRequest, resp *resource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_thing"
}

func (r *thingResource) Schema(_ context.Context, _ resource.SchemaRequest, resp *resource.SchemaResponse) {
	resp.Schema = schema.Schema{
		Attributes: map[string]schema.Attribute{
			"id": schema.StringAttribute{
				Computed: true,
				PlanModifiers: []planmodifier.String{
					stringplanmodifier.UseStateForUnknown(),
				},
			},
			"name": schema.StringAttribute{
				Required: true,
				PlanModifiers: []planmodifier.String{
					stringplanmodifier.RequiresReplace(),
				},
			},
			"value": schema.StringAttribute{
				Optional: true,
				Computed: true,
				Default:  stringdefault.StaticString("default"),
			},
			"fail": schema.BoolAttribute{
				Optional: true,
				Computed: true,
				Default:  booldefault.StaticBool(false),
			},
			"fail_update": schema.BoolAttribute{
				Optional: true,
				Computed: true,
				Default:  booldefault.StaticBool(false),
			},
			"fail_delete": schema.BoolAttribute{
				Optional: true,
				Computed: true,
				Default:  booldefault.StaticBool(false),
			},
		},
	}
}

func (r *thingResource) Create(ctx context.Context, req resource.CreateRequest, resp *resource.CreateResponse) {
	var plan thingResourceModel
	diags := req.Plan.Get(ctx, &plan)
	resp.Diagnostics.Append(diags...)
	if resp.Diagnostics.HasError() {
		return
	}

	if plan.Fail.ValueBool() {
		resp.Diagnostics.Append(diag.NewErrorDiagnostic(
			"failed to create dummy thing",
			fmt.Sprintf("resource %q was configured with fail=true", plan.Name.ValueString()),
		))
		return
	}

	plan.ID = plan.Name
	resp.Diagnostics.Append(resp.State.Set(ctx, &plan)...)
}

// Read must never fail: tofu refreshes (Read) before planning updates, so a
// Read failure would mask fail_update.
func (r *thingResource) Read(ctx context.Context, req resource.ReadRequest, resp *resource.ReadResponse) {
	var state thingResourceModel
	diags := req.State.Get(ctx, &state)
	resp.Diagnostics.Append(diags...)
	if resp.Diagnostics.HasError() {
		return
	}
	// no-op: keep state
	resp.Diagnostics.Append(resp.State.Set(ctx, &state)...)
}

func (r *thingResource) Update(ctx context.Context, req resource.UpdateRequest, resp *resource.UpdateResponse) {
	var plan thingResourceModel
	diags := req.Plan.Get(ctx, &plan)
	resp.Diagnostics.Append(diags...)
	if resp.Diagnostics.HasError() {
		return
	}

	if plan.FailUpdate.ValueBool() {
		resp.Diagnostics.Append(diag.NewErrorDiagnostic(
			"failed to update dummy thing",
			fmt.Sprintf("resource %q was configured with fail_update=true", plan.Name.ValueString()),
		))
		return
	}

	// id stays as name (name is force-new so it won't change on update)
	plan.ID = plan.Name
	resp.Diagnostics.Append(resp.State.Set(ctx, &plan)...)
}

func (r *thingResource) Delete(ctx context.Context, req resource.DeleteRequest, resp *resource.DeleteResponse) {
	var state thingResourceModel
	diags := req.State.Get(ctx, &state)
	resp.Diagnostics.Append(diags...)
	if resp.Diagnostics.HasError() {
		return
	}

	// Delete receives only state: once count=0 removes the instance from
	// config, the flag must already live in state (authored at create time).
	if state.FailDelete.ValueBool() {
		resp.Diagnostics.Append(diag.NewErrorDiagnostic(
			"failed to delete dummy thing",
			fmt.Sprintf("resource %q was configured with fail_delete=true", state.Name.ValueString()),
		))
		return
	}

	// no-op: framework removes from state automatically
}
