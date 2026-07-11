# V1 Spatial Pack Execution Control

The one-time authorization marker was added in commit `bdf2cd003bf16ed621cdcdc63312c75ce5e5d5e5` with parent `9ec437604fbda50f10aca04fcf13ab996dfcb1f1`.

## Mandatory operator rule

Do not re-run, retry, or duplicate the workflow run created by that marker commit. A re-run would start with a fresh workspace and fresh budget ledger and is not authorized.

## Authorized ceiling

- New provider attempts: 47 maximum
- Reserved unit ceiling: USD 1.00
- Reserved total ceiling: USD 47.00
- Automatic retries: disabled
- Promotion: disabled
- Deployment: disabled

## Acceptance

Only the original run attempt is authorized. Any later run attempt must fail closed before provider execution. The generated artifact is not eligible for activation until the independent post-certification workflow verifies receipts, direct-provider provenance, and perceptual near-duplicate thresholds.
