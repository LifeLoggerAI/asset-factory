# Higgsfield provider boundary receipt - 2026-09-30

Repository: `LifeLoggerAI/asset-factory`

Integration branch: `integrate/higgsfield-governed-video-20260930`

## Scope

This change adds a dormant, governed Higgsfield provider boundary for URAI image and video generation.

Implemented source contracts:

- server-only key-id + secret authentication;
- approved `api.higgsfield.ai` request origin;
- asynchronous request polling;
- deterministic idempotency keys;
- bounded artifact downloads;
- server-pinned image/video endpoints;
- Seedance 2.5 text-to-video and image-to-video lanes;
- Cinema Studio 4.0 lane;
- Genjutsu motion-transfer lane;
- fail-closed provider selection;
- sanitized provider diagnostics;
- INTERPRETIVE provenance for all Higgsfield-generated media.

## No-spend / no-live claims

This source change does not:

- create or fund a Higgsfield account;
- create or rotate an API credential;
- call a paid generation model;
- add Higgsfield secrets to App Hosting;
- alter the production provider selector;
- deploy Asset Factory;
- alter the URAI Spatial release candidate;
- certify production generation.

## Truth boundary

Higgsfield generated media is always synthetic and `INTERPRETIVE`.

It cannot become `RECORDED SOURCE TRUTH` through rendering, editing, motion transfer, or visual similarity. Real captured media retains its separate provenance and consent chain.

## Activation gates still required

1. Verify authenticated Higgsfield API account.
2. Verify key creation and funded API balance without exposing credentials.
3. Establish an explicit spend ceiling.
4. Store key ID and secret in the approved secret manager.
5. Bind them to App Hosting through WIF-only authority.
6. Verify sanitized readiness.
7. Run one separately authorized bounded private smoke.
8. Download/hash/store the artifact in URAI-controlled storage.
9. Record exact provider request ID, endpoint, cost, output hash, and QA result.
