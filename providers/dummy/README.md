# terraform-provider-dummy

A local, stateless Terraform/OpenTofu provider used only to generate the test
fixtures of this repository (see `nix/packages/create-tofu-inputs.nix` and
`nix/packages/create-terragrunt-inputs.nix`). It talks to no real
infrastructure: **resource state lives entirely in the tofu state file**, which
is exactly what makes it useful — lifecycle transitions (create, in-place
update, destroy) can be modeled deterministically from configuration alone, and
each operation can be forced to fail on demand.

Built with [terraform-plugin-framework] v1.19.0. The provider address the binary
announces is injected at build time (`-ldflags "-X main.address=..."`), so the
same source serves both registries:

- `registry.terraform.io/dummy/dummy` (hashicorp terraform,
  `nix build .#dummy-provider`)
- `registry.opentofu.org/dummy/dummy` (opentofu,
  `nix build .#dummy-provider-opentofu`)

The provider itself has **no configuration block**:

```hcl
provider "dummy" {}
```

## Resources

### `dummy_thing`

| Attribute     | Type   | Required | Optional | Computed | Default     | Plan modifiers         |
| ------------- | ------ | -------- | -------- | -------- | ----------- | ---------------------- |
| `id`          | string |          |          | ✔        | (set)       | `UseStateForUnknown()` |
| `name`        | string | ✔        |          |          | —           | `RequiresReplace()`    |
| `value`       | string |          | ✔        | ✔        | `"default"` |                        |
| `fail`        | bool   |          | ✔        | ✔        | `false`     |                        |
| `fail_update` | bool   |          | ✔        | ✔        | `false`     |                        |
| `fail_delete` | bool   |          | ✔        | ✔        | `false`     |                        |

#### Semantics

- **`id`** is always set to `name` on create.
- **`name`** forces replacement when changed.
- **`value`** is the only updatable attribute; changing it triggers an in-place
  update.
- **`fail`** makes `Create` fail. Because the resource never reaches state, it
  fails again on every subsequent apply — the persistent "create fails" fixture.
- **`fail_update`** makes `Update` fail while leaving the resource in state. It
  is checked against the _plan_ (configuration), so it is inert at create time:
  set it at create, flip `value` later, and the update errors while the prior
  state is retained.
- **`fail_delete`** makes `Delete` fail. Delete only ever receives _state_ —
  once a `count = 0` removes the instance from configuration, the attribute is
  no longer planned — so the flag must be **authored at create time** and rides
  along in state until the destroy fails.
- `Read` is a deliberate no-op that can never fail: tofu refreshes (Read) before
  planning updates, so a Read failure would mask `fail_update`.
- `Delete` without `fail_delete` is a no-op; the framework drops the instance
  from state.

Error messages (stable, snapshotted in the jest fixtures):

| Flag          | Summary                        | Detail                                                   |
| ------------- | ------------------------------ | -------------------------------------------------------- |
| `fail`        | `failed to create dummy thing` | `resource "<name>" was configured with fail=true`        |
| `fail_update` | `failed to update dummy thing` | `resource "<name>" was configured with fail_update=true` |
| `fail_delete` | `failed to delete dummy thing` | `resource "<name>" was configured with fail_delete=true` |

#### Example

```hcl
provider "dummy" {}

# create fails, on every apply
resource "dummy_thing" "fails" {
  name = "fail-thing"
  fail = true
}

# create ok; value flips trigger an in-place update
resource "dummy_thing" "changed" {
  name  = "changed-thing"
  value = var.step >= 2 ? "changed" : "initial"
}

# create ok; the step-2 update errors, prior state is kept
resource "dummy_thing" "fails_update" {
  name        = "fail-update-thing"
  value       = var.step >= 2 ? "changed" : "initial"
  fail_update = true
}

# create ok; the step-2 destroy (count -> 0) errors
resource "dummy_thing" "fails_delete" {
  count       = var.step >= 2 ? 0 : 1
  name        = "fail-delete-thing"
  fail_delete = true
}
```

## Data sources

### `dummy_value`

| Attribute | Type   | Required | Computed |
| --------- | ------ | -------- | -------- |
| `name`    | string | ✔        |          |
| `value`   | string |          | ✔        |

Read always succeeds and returns `value = "value-for-<name>"`. The value is not
derived from any resource — it exists purely to exercise data-source read
parsing (`Reading...` / `Read complete after Ns`) in the fixtures.

```hcl
data "dummy_value" "lookup" {
  name = "query-key"
}

output "datalookup_value" {
  value = data.dummy_value.lookup.value # "value-for-query-key"
}
```

## Build

```
nix build .#dummy-provider             # registry.terraform.io address
nix build .#dummy-provider-opentofu    # registry.opentofu.org address
```

There are no unit tests; the provider is exercised end-to-end by the fixture
generators and asserted through the jest snapshot suites in `js/`.

[terraform-plugin-framework]: https://github.com/hashicorp/terraform-plugin-framework
