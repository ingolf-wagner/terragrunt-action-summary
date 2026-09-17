terraform {
  required_providers {
    dummy = {
      source = "dummy/dummy"
    }
  }
}

provider "dummy" {}

resource "dummy_thing" "first" {
  name  = "first-thing"
  value = "alpha"
}

resource "dummy_thing" "second" {
  name  = "second-thing"
  value = "beta"
}

data "dummy_value" "lookup" {
  name = "query-key"
}

output "first_value" {
  value = dummy_thing.first.value
}

output "datalookup_value" {
  value = data.dummy_value.lookup.value
}