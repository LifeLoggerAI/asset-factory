# Tripo V3 protected adapter

The Tripo adapter uses the V3 `openapi.tripo3d.ai` origin and the separate text,
image, and named multiview generation routes. Task polling uses `/v3/tasks/{id}`;
read-only account metadata uses `/v3/account/balance`. The existing default
`v3.1-20260211` model and quality controls are retained. The compatible
`v3.0-20250812` H model can be selected explicitly. Other models require a
deliberate schema and price review rather than silent substitution.

The [official migration guide](https://developers.tripo3d.ai/en/docs/migration-v2-to-v3)
states that V2 maintenance stopped on October 1, 2026 at 00:00 UTC+8 and V2
endpoints stop on November 1, 2026 at 00:00 UTC+8. Those instants are September
30 and October 31 at 16:00 UTC respectively. The current response contracts are
documented in [task queries](https://developers.tripo3d.ai/en/docs/task-query)
and [account balance](https://developers.tripo3d.ai/en/docs/account).

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
