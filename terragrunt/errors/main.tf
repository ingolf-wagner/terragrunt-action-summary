terraform {
  required_providers {
    dummy = {
      source = "dummy/dummy"
    }
  }
}

provider "dummy" {}

# Applied once per step by the fixture generators when steps.hcl is present
# (TF_VAR_step=1..max_step); state accumulates so phase 2 produces
# updates/destroys/failures over phase-1 resources. Stacks without steps.hcl
# run once with the default.
variable "step" {
  description = "Fixture phase control: generators set TF_VAR_step=1..max_step"
  type        = number
  default     = 1
}

# Created in step 1, never touched afterwards -> nothing-changed in step 2.
resource "dummy_thing" "ok" {
  name  = "ok-thing"
  value = "works"
}

# Value flips in step 2 -> in-place update.
resource "dummy_thing" "changed" {
  name  = "changed-thing"
  value = var.step >= 2 ? "changed" : "initial"
}

# Count drops to 0 in step 2 -> destroyed.
resource "dummy_thing" "deleted" {
  count = var.step >= 2 ? 0 : 1
  name  = "deleted-thing"
}

# Update errors in step 2; the flag is checked against the plan (config), so
# it is inert at create time and the value change in step 2 triggers Update.
resource "dummy_thing" "fails_update" {
  name        = "fail-update-thing"
  value       = var.step >= 2 ? "changed" : "initial"
  fail_update = true
}

# Delete errors in step 2. Delete only sees state, so the flag must be
# authored at create time; config is gone once count = 0.
resource "dummy_thing" "fails_delete" {
  count       = var.step >= 2 ? 0 : 1
  name        = "fail-delete-thing"
  fail_delete = true
}

# Create errors in every phase.
resource "dummy_thing" "fails" {
  name = "fail-thing"
  fail = true
}
