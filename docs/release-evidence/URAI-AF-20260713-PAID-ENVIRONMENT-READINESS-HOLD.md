# URAI Asset Factory paid-environment readiness hold

Status: BLOCKED — authorization is recorded; external key and usable-credit proof remain required.

## Proven complete

- Asset Factory security controls merged.
- Merged-main historical safe-resume validation passed at `main@d91a765c94a6bfdf18cf85293528e2448303111e`.
- Validation run `29277869759` completed successfully.
- Exact receipt artifact `8290124849` was independently inspected.
- All four historical marker attempts showed generation skipped.
- Provider calls and confirmed spend from the current lane remain `0` and `USD 0`.
- The future paid marker is absent.
- The user explicitly authorized one V1 Spatial generation run with no more than 47 provider calls and no more than USD 47 total spend.
- Immutable authorization receipt: `docs/release-evidence/URAI-AF-20260714-V1-SPATIAL-SPEND-AUTHORIZATION.md` at commit `9f064d8da2ce0cf93aef20b388e4ae589009cac7`.

## Current paid contract

- Environment: `paid-asset-generation`
- Secret required: `OPENAI_API_KEY`
- Provider: `openai`
- Endpoint: `https://api.openai.com/v1/images/generations`
- Opaque model: `gpt-image-2`
- Alpha model: `gpt-image-1.5`
- Maximum new provider calls: `47`
- Maximum unit cost: `USD 1.00`
- Absolute maximum total cost: `USD 47.00`
- Retry attempts: `1`
- Canonical outputs: `53`
- Promotion: disabled

## Satisfied requirement

1. Explicit user authorization for one run with no more than 47 provider calls and no more than USD 47 total spend: **SATISFIED**.

## Remaining unproven requirements

1. `OPENAI_API_KEY` is installed and non-empty in the Asset Factory `paid-asset-generation` environment.
2. At least `USD 47.00` of usable API credit remains available at execution time.

## Safety boundary

Do not create or merge `authorizations/execute-v1-aaa-spatial-pack-safe-resume-3-20260711.json` until both remaining requirements are satisfied. Do not call providers, generate, promote, deploy, or activate assets from this hold record.
