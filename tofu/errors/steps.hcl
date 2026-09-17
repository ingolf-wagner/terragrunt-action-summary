# Fixture generator marker: tofu and terragrunt never load this file (only
# *.tf and terragrunt.hcl are consumed). Its presence makes the fixture
# generators apply the stack once per step with TF_VAR_step=1..max_step,
# accumulating state across phases.
max_step = 2
