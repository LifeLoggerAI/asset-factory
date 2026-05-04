# URAI Asset Factory Schema

Status: Draft canonical schema, 2026-05-04

This file defines the schema contract used by the public Asset Factory product and downstream URAI systems.

## Collection overview

| Collection | Purpose | Owner field | Client reads | Client writes |
|---|---|---:|---:|---:|
| `tenants` | Tenant profile, subscription status, Stripe customer mapping | document id | owner only | no |
| `assetJobs` | Job lifecycle and canonical state machine | `ownerId` | owner only | create pending only |
| `generatedAssets` | Individual generated asset records | `ownerId` | owner only | no |
| `assetBundles` | Bundled export artifacts | `ownerId` | owner only | no |
| `usageLedger` | Immutable billable usage events | `ownerId` | owner only | no |
| `billingAudit` | Stripe/reconciliation audit records | n/a | no | no |
| `webhooks` | Processed webhook idempotency records | n/a | no | no |
| `exportJobs` | Export/download issuance records | `ownerId` | owner only | no |
| `replayJobs` | Replay/video registration records | `ownerId` | owner only | no |
| `lifeMapInputs` | LifeMap ingestion inputs and snapshots | `ownerId` | owner only | no |
| `deadJobs` | Permanently failed jobs needing support/admin attention | `ownerId` | owner only | no |
| `auditLogs` | Sensitive operational and security audit events | n/a | no | no |
| `adminActions` | Admin/ops action trail | n/a | no | no |
| `templates` | Public or tenant-visible template definitions | optional | signed in | no |
| `generatorPresets` | Generator preset definitions | optional | signed in | no |
| `brandKits` | Tenant brand kits | `ownerId` | owner only | no |
| `entitlements` | Effective feature gates and limits | `ownerId` | owner only | no |

## `assetJobs/{jobId}`

```json
{
  "ownerId": "uid_123",
  "tenantId": "uid_123",
  "status": "PENDING",
  "input": {
    "type": "symbolic-ui",
    "clientRequestId": "optional-idempotency-key",
    "prompt": "Generate a calm sky overlay",
    "formats": ["png", "webp", "svg"],
    "presetId": "optional-template-or-preset"
  },
  "retryCount": 0,
  "maxRetries": 3,
  "bundlePath": "assets/uid_123/job_123/bundle.zip",
  "downloadUrl": "short-lived-signed-url",
  "outputHash": "sha256",
  "processingTimeMs": 1234,
  "schemaVersion": "2026-05-04",
  "createdAt": "serverTimestamp",
  "updatedAt": "serverTimestamp"
}
```

### Job states

`PENDING -> PROCESSING -> PACKAGING -> VERIFYING -> COMPLETED`

Terminal states:

- `FAILED`: retryable failure
- `DEAD`: permanently failed after retry budget
- `CANCELED`: user or admin canceled before completion

## `generatedAssets/{assetId}`

```json
{
  "ownerId": "uid_123",
  "tenantId": "uid_123",
  "jobId": "job_123",
  "type": "symbolic-ui",
  "bundlePath": "assets/uid_123/job_123/bundle.zip",
  "outputHash": "sha256",
  "processingTimeMs": 1234,
  "schemaVersion": "2026-05-04",
  "createdAt": "serverTimestamp"
}
```

## `assetBundles/{bundleId}`

```json
{
  "ownerId": "uid_123",
  "tenantId": "uid_123",
  "jobId": "job_123",
  "type": "symbolic-ui",
  "storagePath": "assets/uid_123/job_123/bundle.zip",
  "outputHash": "sha256",
  "schemaVersion": "2026-05-04",
  "createdAt": "serverTimestamp"
}
```

## `usageLedger/{usageId}`

```json
{
  "ownerId": "uid_123",
  "tenantId": "uid_123",
  "jobId": "job_123",
  "type": "symbolic-ui",
  "costUnits": 1,
  "source": "processAssetJob",
  "createdAt": "serverTimestamp"
}
```

## Asset family matrix

| Family | Purpose | Inputs | Outputs | Downstream consumers |
|---|---|---|---|---|
| Symbolic UI assets | URAI interface elements | mood, theme, prompt, brand kit | PNG, WebP, SVG | URAI main app, Studio, Visuals |
| Sky layers | Mood/weather skies | mood, time, season, palette | PNG, WebP | URAI app, Replay, Spatial |
| Aura blobs | Companion/mood fields | mood vectors, intensity | PNG, WebP, SVG, Lottie-ready JSON | URAI app, Motion |
| Silhouettes | Body/identity overlays | pose, emotion, style | PNG, SVG | URAI app, Visuals |
| Constellations | Memory/life map views | lifeMap events, chapter state | SVG, JSON, PNG | LifeMap, Replay, Spatial |
| Memory blooms | Recovery/insight moments | event, archetype, mood | PNG, WebP, animation frames | Replay, Scrolls |
| Scroll frames | Narrative exports | chapter, tone, assets | PNG, PDF-ready frames, JSON manifest | Scrolls, Studio, Cinema |
| Replay/video assets | Video scene packs | replay script, timeline, assets | JSON manifest, frames, bundles | Cinema, Motion, Replay Engine |
| Ritual cards | Healing/shareable prompts | ritual, archetype, tone | PNG, WebP, SVG | URAI app, Foundation |
| Glyphs/badges | Achievements and symbols | signature type, aura color | SVG, PNG | URAI app, Admin, Marketplace |
| Brand kits | Product/customer visual packs | palette, typography, logo, style | ZIP bundle, JSON manifest | Enterprise, Studio |

## Versioning

- `schemaVersion` uses `YYYY-MM-DD` format.
- Generated bundles include `manifest.json` with generator, schema version, deterministic flag, owner, tenant, job id, output hash, and created timestamp.
- Breaking schema changes require a new ADR and migration script.
