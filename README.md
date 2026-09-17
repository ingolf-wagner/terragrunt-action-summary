# terragrunt-action-summary

A GitHub Action that turns
[gruntwork-io/terragrunt-action](https://github.com/gruntwork-io/terragrunt-action)
apply output (running OpenTofu) into a readable Markdown summary on the workflow
run page (`$GITHUB_STEP_SUMMARY`): per-resource action icons, final state,
timings, and outputs.

Repo: [ingolf-wagner/terragrunt-action-summary](https://github.com/ingolf-wagner/terragrunt-action-summary).

```text
## Tofu Summary ✅

**Resources:** 2 added, 0 changed, 0 destroyed.

| resource | action | state | time |
| --- | --- | --- | --- |
| `data.dummy_value.lookup` | 🔍 | ✔ | 0s |
| `dummy_thing.first` (id=first-thing) | ✍️ | ✔ | 0s |
| `dummy_thing.second` (id=second-thing) | ✍️ | ✔ | 0s |

**2 outputs:**

- `datalookup_value` = `"value-for-query-key"`
- `first_value` = `"alpha"`
```

## Usage

The action takes the URL-encoded `tg_action_output` output of a
`gruntwork-io/terragrunt-action` step and appends the rendered summary to the
step summary of the job:

```yaml
- name: Deploy
  uses: gruntwork-io/terragrunt-action@v3
  id: apply
  with:
    tg_version: "1.1.3"
    tofu_version: "1.12.6"
    tg_dir: "terragrunt/simple"
    tg_command: "apply"
    tg_output_capture: "1"

- name: Tofu apply summary
  if: always() && steps.apply.outputs.tg_action_output != ''
  uses: ingolf-wagner/terragrunt-action-summary@v1
  with:
    action_output: ${{ steps.apply.outputs.tg_action_output }}
```

See [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) for a
complete workflow that plans on pull requests and applies on `main` using tofu
via terragrunt.

| Input           | Required | Description                                                                       |
| --------------- | -------- | --------------------------------------------------------------------------------- |
| `action_output` | yes      | URL-encoded `tg_action_output` from `gruntwork-io/terragrunt-action` step outputs |

The action reads `tg_action_output` (plain-text terragrunt/tofu output,
URL-encoded by terragrunt-action), decodes it, parses the apply result, and
appends the Markdown summary to `$GITHUB_STEP_SUMMARY`. It never fails the
workflow on unparseable output; guard the step with `if: always()` to get a
summary even when the apply step fails — failures are rendered with an ❌ badge.

The compiled parser (`js/dist/`) is committed so the published action is
self-contained — `uses: ingolf-wagner/terragrunt-action-summary@v1` requires
`action.yml` at the repo root and no build step at consume time. After
changing `js/src`, rebuild with `cd js && npm run build` and commit `js/dist/`.

## Development

```
js/       parser, renderer, tests (jest) — npm test inside js/
index.js, action.yml   the node20 action entrypoint at the repo root
nix/      devshell + fixture generation with a local dummy provider
terragrunt/, tofu/   fixture source stacks consumed by the integration tests
```

Run tests via the flake: `nix develop -c test`, integration tests with
`nix develop -c test-integration`, or plain `cd js && npm test`. Regenerate
fixtures with `nix run .#create-tofu-inputs` /
`nix run .#create-terragrunt-inputs`.
