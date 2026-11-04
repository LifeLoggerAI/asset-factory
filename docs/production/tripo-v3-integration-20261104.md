# Tripo V3 integration verification — November 4, 2026

## Verified source state

The existing migration is integrated into the executable Factory convergence
candidate, but has not reached the default branch. This is source and regression
verification, not a production provider, billing, asset-quality or release receipt.

| Surface | Verified state before this correction |
| --- | --- |
| Default `main` | `a49f611ade29a1754787701ab4bf915c85c0cdc6`; Forge submit/poll and account preflight still use V2. |
| Existing migration [PR #480](https://github.com/LifeLoggerAI/asset-factory/pull/480) | Merged October 8 into `repair/model-forge-current-main-20261007` at `2114e86d547b5c8c419e4aa3e63efaf58a20cd1d`. |
| Current owner [PR #421](https://github.com/LifeLoggerAI/asset-factory/pull/421) | OPEN / DRAFT / UNMERGED at `74445b5d99478f1288604243596d00d6d238b64c`; 18 commits ahead of #480, zero behind, merge base exactly #480. No published GitHub release was returned. |
| Migration preservation | Six of #480's seven changed files have identical Git blobs in the owner. The only later `forge.mjs` difference requires embedded GLB resources; the V3 producer is unchanged. |
| Existing native evidence | [Model Forge Spend Source run 38133596844](https://github.com/LifeLoggerAI/asset-factory/actions/runs/38133596844), job 114452793016, passed all 364 cases on exact owner `74445b5d…` using its Node 22 workflow. This receipt does not transfer to a successor. |

The existing adapter uses `https://openapi.tripo3d.ai/v3/generation/` with distinct
text, image and named-multiview operations, `/v3/tasks/{id}` for polling, and
`/v3/account/balance` for bounded account metadata. It retains default
`v3.1-20260211` and explicit compatible `v3.0-20250812`. The source contracts match
the current official [migration](https://developers.tripo3d.ai/en/docs/migration-v2-to-v3),
[H-model generation](https://developers.tripo3d.ai/en/docs/generation-text-to-model/standard),
[task](https://developers.tripo3d.ai/en/docs/task-query) and
[account](https://developers.tripo3d.ai/en/docs/account) documentation.

## Consumers and configuration boundaries

- `model_forge/run-wave.mjs` invokes account preflight, then the actual Forge CLI.
  Wave 01 includes Tripo; wave 02 selects Replicate. The six retained model specs
  list Tripo among candidate providers. A listed provider is not evidence of use.
- `.github/workflows/home-aaa-no-spend-proof.yml` runs the exact PR source in
  dry-run mode with spending disabled.
- `.github/workflows/replicate-bounded-model3d-smoke.yml` selects trusted `main`.
  Its Home readiness job reads Meshy/Tripo/Rodin credentials through protected
  WIF and App Hosting secret access in `asset-factory-production`, queries only
  balance metadata, and cleans up the generated credential file. Its existing
  Home generation consumer explicitly selects Replicate, not Tripo.
- The inspected workflow does not export `URAI_TRIPO_MODEL`. The complete tracked
  owner search found no deprecated model override, texture-version setting or
  segmentation consumer. Retired version strings occur only in negative tests
  and migration documentation after this correction.
- Indexed default-branch searches across accessible `LifeLoggerAI` repositories
  found one `URAI_TRIPO_MODEL` consumer and four references to the Forge CLI,
  all in Asset Factory. This index is not an exhaustive search of all branches,
  deployments, local machines or private protected job records.

Live protected configuration remains unverified. The GitHub connector does not
expose environment/secret settings; the connected Opera browser was unavailable,
and the cloud browser was signed out. No credential values were retrieved,
printed or changed. The local worker has no Tripo credential or model override;
that observation says nothing about production. Existing protected gateway
account, pricing, job, source and runtime-control records were not readable in
this session. No fresh live provider preflight was requested.

## Small correction on the existing owner

The completed migration is reused; the generation adapter and spend client are
unchanged. Account preflight previously checked balance without validating the
selected model, so an unsupported override could yield misleading metadata.

1. Preflight validates the effective override against the same two models already
   admitted by generation. Unsupported values fail the CLI and receipt before a
   balance read, in live and offline modes; raw values are not echoed. Empty
   values retain the existing default.
2. The actual sanitized Home artifact retains the admitted model and explicit
   false authorization, execution and protected-account-binding fields.
3. The Home plan consumer now distinguishes requested spending from authorized
   spending. It accepts the current real dry-run contract and rejects claims of
   authorization or execution. All existing manual confirmation, protected-main,
   WIF, one-shot marker, budget and gateway boundaries remain.
4. Synthetic regressions execute the actual preflight CLI, Forge dry-run and
   workflow jq filters, including negative deprecated-model and authority cases.

The November 2 vendor notice schedules model/texture `v2.5-20250123` and
segmentation `v1.0-20250506` retirement for December 1, 2026. That version notice
is separate from the October migration record's V2 endpoint retirement dates.
Neither establishes an active outage or a current paid Tripo dependency.

## No-cost verification

Local Node `v24.22.1`: all eight maintained Model Forge source suites passed
**376/376**, zero failures, skips or cancellations, with credentials removed from
the test environment. Syntax checks, both workflow YAML parses, whitespace
checks, the existing Replicate paid-smoke boundary, current paid-workflow
boundary and both paid-workflow regression scripts passed. No provider request,
live balance read, paid generation, reservation, charge reconciliation, protected
setting change, main merge or production deployment was performed.

The test command was:

```sh
node --test scripts/test-protected-artifact.mjs scripts/test-model-forge-spend-client.mjs scripts/test-model-forge-spend-leaves.mjs scripts/test-model-forge-tripo-v3.mjs scripts/test-model-forge-response-boundary.mjs scripts/test-model-forge-execution-outcomes.mjs scripts/test-model-forge-glb-container.mjs scripts/test-protected-workflow-spend-leaves.mjs
```

## Remaining external requirements

1. Read the real protected environment and executable deployment's effective
   model configuration through authenticated owner access. Inspect only model
   selections and credential-presence/binding metadata, without exposing keys.
2. Earn fresh native Node 22 evidence on the corrected exact candidate and obtain
   the existing independent release review/admission before moving #421 to main.
   The main-bound readiness job remains V2 until that admission occurs.
3. Before any paid Tripo request, bind the admitted immutable source and V3
   endpoint/request bytes to authentic account/credential, current price, rights
   and input records, signed bounded approval, shared reservation, hard budget
   and runtime limits, and independent charge reconciliation. Old V2 request
   approvals cannot be reused. Image/multiview inputs still require protected
   immutable materialization before the actual paid candidate loop permits them.

This correction does not grant paid execution or production release authority.
