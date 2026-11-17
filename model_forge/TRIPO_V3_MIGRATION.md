# Tripo V3 protected adapter

The Tripo adapter uses the V3 `openapi.tripo3d.ai` origin and the separate text,
image, and named multiview generation routes. Task polling uses `/v3/tasks/{id}`;
read-only account metadata uses `/v3/account/balance`. The existing default
`v3.1-20260211` model and quality controls are retained. The compatible
`v3.0-20250812` H model can be selected explicitly. Other models require a
deliberate schema and price review rather than silent substitution.

## November 16, 2026 texture-default compatibility (source-only review)

Tripo notified the account on November 12 that the implicit generation texture
version changes from `v3.0-20250812` to `v3.5-20260815` on November 16.
Geometry `model` and `texture_quality` do not separately pin the texture model.
The existing protected H3.1 V3 adapter now explicitly sets
`texture_version: 'v3.0-20250812'` on its shared request for text, image and
named multiview generation, preserving the former baseline. The effective
version is recorded as `providerTextureVersion` in candidate provenance.
A separate `/v3/models/texture` operation is not implemented in this adapter;
its version selector would be `model`, not `texture_version`.

This is a stability pin, not proof that V3.0 is visually superior to V3.5.
Delight, which requires V3.5, remains absent; no implicit texture upgrade,
`fast` quality change, new model, or provider-price authorization is admitted.
The synthetic V3 test suite checks all three request modes, 4K/8K quality,
seeds, version/provenance fields and the distinct protected request fingerprints.
Every new request/source fingerprint must obtain fresh independently bounded
approval and account/price evidence. Prior V2 or unpinned V3 approvals do not
carry over. No provider execution, new assets, deployment, CI certification or
production acceptance follows from this patch. Existing AAA, GLB, rights,
performance, literal-scene-pixel and independent approval gates remain HOLD.

The November 11 provider retention notice separately warns that from
December 1 API task assets may expire after seven days. Preserve downloaded
assets and hashes in approved custody; provider task IDs alone are not archival.
Official generation contracts:
https://developers.tripo3d.ai/en/docs/generation-text-to-model/standard
https://developers.tripo3d.ai/en/docs/generation-image-to-model/standard
https://developers.tripo3d.ai/en/docs/generation-multiview-to-model/standard

The [official migration guide](https://developers.tripo3d.ai/en/docs/migration-v2-to-v3)
documents the V3 origin and endpoint mappings. The October 8 migration record's
V2 endpoint retirement dates are historical and separate from the November 2,
2026 vendor notice: model and texture version `v2.5-20250123` and segmentation
version `v1.0-20250506` are scheduled for discontinuation on December 1, 2026.
Do not infer an active outage or paid provider dependency from either notice.
The current response contracts are documented in
[task queries](https://developers.tripo3d.ai/en/docs/task-query) and
[account balance](https://developers.tripo3d.ai/en/docs/account).

Every generation POST still goes through the protected Model Forge spend
client. The new endpoint and materialized request bytes have new request
identities. Jobs, account and credential binding, pricing, bounded budget,
source authority, signed approval, and the atomic reservation must be refreshed
for those exact identities. V2 approvals cannot be reused. The migration does
not create or change a price, funded balance, or authorization.

Task identity, operation type, lifecycle, progress, model URL, and optional
provider-reported credits are checked before candidate retrieval. Reported
credits do not settle charges or release uncertain holds. A failed or uncertain
task never authorizes regeneration. Remote reference images remain blocked by
the existing protected materialization guard in the actual candidate loop.

Account preflight is bounded read-only metadata. Its receipt explicitly keeps
paid execution and protected account binding false. Source-only synthetic
regressions do not certify a real provider request, production tenant, billing,
privacy, rights, asset quality, or release acceptance.

Preflight now checks `URAI_TRIPO_MODEL` against the same two models already
admitted by the existing generation adapter, including in offline mode. An
unsupported override returns a failing receipt and CLI status before a balance
read; its raw value is never echoed. An empty override retains the adapter's
existing default. The sanitized Home readiness artifact preserves the admitted
model and all three explicit non-authority fields. These checks do not change
protected settings, authorize generation, or admit another model or price.
The existing Home consumer also checks the current plan's `spendRequested`
opt-in separately from its false authorization and execution fields; a dry-run
can never satisfy that contract by claiming paid authority.
