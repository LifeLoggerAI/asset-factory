# Integration Map

## Internal repo integration points

| Consumer / system | Current evidence | Status |
| --- | --- | --- |
| UrAi | Manifest paths and URAI spatial categories exist for home, ground, life-map, focus, replay, mirror, passport, location-map, UI, and avatar imagery. | Declared asset contract only; consuming repo import proof not verified in this pass. |
| urai-spatial | Manifest categories are explicitly `urai_spatial_*`, and Studio supports model3d/GLTF proof output. | Partial; spatial asset output exists as deterministic proof, but consuming repo runtime integration not verified. |
| urai-studio | Asset Factory Studio is the canonical multimodal API surface with generation, materialization, fetch, publish, approve, usage, dashboard, system, cron, support, and Stripe routes documented in launch readiness. | Partial; local proof surface exists, production auth/provider/worker path unproven. |
| urai-content | Bundle manifests and generated asset fetch routes could support content workflows. | Not verified; no cross-repo import or publishing evidence found in this pass. |
| urai-marketing | PNG image manifest includes marketing/product-art style assets and export ZIP pipeline. | Not verified; no marketing repo consumption proof in this pass. |

## Runtime integration points

| Integration | Current evidence | Status |
| --- | --- | --- |
| Firebase Firestore / Storage | Studio env example documents Firebase Admin values; store layer selects local/Firebase backend and writes artifact storage paths. | Partial; production Firebase project/rules/indexes/IAM evidence still pending. |
| Provider-backed generation | Provider env keys and runtime seams exist for OpenAI, Replicate, FAL, ElevenLabs, Stability. | Not production-proven; LAUNCH_READINESS requires live provider evidence. |
| Durable workers | Queue mode envs exist for local-inline, firestore-queue, and http-task. | Not production-proven; worker/DLQ evidence pending. |
| Stripe | Stripe envs and webhook/entitlement seams exist. | Not production-proven; live signed webhook and tenant entitlement persistence pending. |
| Auth / tenant isolation | API key, JWT HS256, tenant claim, role claim, and legacy header configuration exist. Approval route was hardened in this pass. | Partial; live tenant isolation smoke pending. |
| Observability | Optional Sentry/PostHog envs are present. | Not production-proven; monitoring links and dashboards pending. |

## Required integration proof before READY

1. Fresh `assetfactory-studio` local gates pass.
2. Fresh Python image pipeline run produces `validation_report.json` and `asset_pack.zip`.
3. Staging smoke runs with `ASSET_FACTORY_FORCE_LOCAL=false`.
4. Production smoke runs with `ASSET_FACTORY_FORCE_LOCAL=false`.
5. Provider-backed generation proves selected launch asset types.
6. Cross-tenant denial proves Tenant A cannot access Tenant B jobs/assets/files.
7. Worker queue/DLQ proof demonstrates retry limits, idempotency, and retention cleanup.
8. Stripe signed webhook proof persists idempotent tenant entitlements.
9. Consumer repos import or fetch assets from the published contract rather than relying on copied placeholders.
