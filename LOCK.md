# Asset Factory Production Lock

STATUS: **NOT PRODUCTION LOCKED**

Current authority date: 2026-09-24.

Historical Asset Factory deployments and smoke evidence exist for Firebase project/site `urai-4dc1d`. That evidence is preserved for history, but `urai-4dc1d` is shared consumer infrastructure and is **not valid final Asset Factory production authority**.

## Current source authority

- Core convergence parent: PR #278.
- Dedicated production-authority hardening parent: draft PR #281.
- Unified production + Model Forge + multimodal successor: draft PR #284, stacked on #281.
- PR #284 carries the complete file surface of prior Model Forge PR #279 and multimodal provider PR #282; those sibling lanes are no longer the intended forward integration path once #284 earns exact-head gates.
- Active Firebase Functions source: `life-map-pipeline/functions`.
- Active Functions runtime: Node 22.
- Root `functions/`: historical Node 18 tree, non-deployable.

## Required dedicated production authority

Production cannot unlock until the protected environment contains provider-generated, verified values for:

```text
ASSET_FACTORY_FIREBASE_PROJECT_ID
ASSET_FACTORY_FIREBASE_HOSTING_SITE
ASSET_FACTORY_BASE_URL
GCP_WIF_PROVIDER
GCP_DEPLOY_SERVICE_ACCOUNT
```

The guarded production path must reject:

- `urai-4dc1d`;
- `asset-factory-dev-id`;
- their legacy Firebase Hosting origins;
- `urai.app` / `www.urai.app`.

## Historical evidence boundary

Older files under `docs/release-evidence/` and `docs/PRODUCTION_VERIFICATION_REPORT.md` may prove that an earlier Asset Factory surface ran on shared Firebase infrastructure. They do **not** prove the current exact source is deployed to the final dedicated production target.

## Production-lock requirements

Do not change this status to production locked until all mandatory receipts exist for the same approved release:

1. exact merged source SHA;
2. eligible independent approval;
3. dedicated Firebase/GCP project and Hosting site;
4. WIF/least-privilege deploy identity;
5. protected staging with local fallback disabled;
6. auth and cross-tenant denial;
7. durable worker/retry/DLQ proof;
8. Stripe TEST signature + idempotent entitlement proof;
9. provider generation where actually required;
10. promoted-asset provenance/rights receipts;
11. monitoring/spend/queue evidence;
12. account export/deletion and privacy/security approval;
13. exact production deploy revision;
14. rollback revision and tested rollback path;
15. dedicated provider-origin smoke;
16. custom-domain DNS/TLS/API routing proof;
17. final live smoke and retained evidence pack.

Historical green CI or historical live smoke cannot substitute for a missing current receipt.
