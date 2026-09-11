terraform {
  required_providers {
    dummy = {
      source = "dummy/dummy"
    }
  }
}

provider "dummy" {}

resource "dummy_thing" "ok" {
  name  = "ok-thing"
  value = "works"
}

resource "dummy_thing" "fails" {
  name = "fail-thing"
  fail = true
}