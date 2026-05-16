# Asset Factory API Contract

Status: canonical contract for Core, Studio, Life Map, billing, workers, and operations.

This file defines the HTTP contract that UrAi Core and other systems may depend on. A subsystem is not considered integrated until its implementation, tests, smoke scripts, and operations docs conform to this contract.

## Versioning

- Contract version: `asset-factory-api-v1`
- Breaking changes require a new contract version and a migration note.
- Existing fields may only be removed after all consumers have migrated.

## Runtime environments

| Environment | Base URL | Completion rule |
| --- | --- | --- |
| Local proof | `http://localhost:<port>` | Deterministic proof renderers may be used. |
| Staging | `https://staging.uraiassetfactory.com` | Must run with local fallback disabled and production-like auth. |
| Production Firebase slice | `https://urai-4dc1d.web.app` | Verified for Firebase health, asset request/status, and Life Map event ingestion only. |
| Production public domain | `https://www.uraiassetfactory.com` | Not complete until DNS/TLS, legal/trust/status pages, auth, tenant isolation, provider-backed generation, billing, worker, observability, and production smoke evidence pass. |

## Authentication and tenancy

Production and staging protected routes must require all applicable controls:

- `Authorization: Bearer <jwt>` when `ASSET_FACTORY_REQUIRE_AUTH=true`.
- `x-asset-factory-api-key: <secret>` when `ASSET_FACTORY_REQUIRE_API_KEY=true`.
- A tenant claim in the JWT, mapped to `tenantId`.
- A role claim mapped to one of: `viewer`, `creator`, `publisher`, `admin`, `operator`.
- Optional `Idempotency-Key` on mutating calls.

No protected route may trust a user-supplied `tenantId` over the verified auth claim. Test-only tenant IDs may be accepted only in local proof mode.

## Role matrix

| Capability | viewer | creator | publisher | admin | operator |
| --- | --- | --- | --- | --- | --- |
| Read own tenant job/status | yes | yes | yes | yes | yes |
| Create generation job | no | yes | yes | yes | no |
| Materialize/render job | no | yes | yes | yes | operator-only worker routes |
| Publish asset | no | no | yes | yes | no |
| Approve asset | no | no | yes | yes | no |
| Inspect tenant billing/quota | no | no | no | yes | no |
| Inspect queue/DLQ/diagnostics | no | no | no | yes | yes |
| Requeue/dead-letter operations | no | no | no | no | yes |

## Common headers

### Request headers

| Header | Required | Notes |
| --- | --- | --- |
| `Authorization` | staging/production protected routes | Bearer JWT. |
| `x-asset-factory-api-key` | protected mutating routes/full diagnostics | Secret value from secrets manager. |
| `Content-Type` | POST/PUT/PATCH | `application/json`, except Stripe webhook raw body handling. |
| `Idempotency-Key` | recommended for POST | Required for external consumers once provider-backed generation is enabled. |
| `x-request-id` | optional | Server generates one if absent. |

### Response headers

| Header | Rule |
| --- | --- |
| `x-request-id` | Returned on all responses. |
| `Cache-Control` | Protected/dynamic responses use `no-store`. |
| `Content-Type` | JSON responses use `application/json`. |

## Error envelope

All non-2xx responses must use this shape:

```json
{
  "ok": false,
  "error": {
    "code": "TENANT_FORBIDDEN",
    "message": "Tenant access denied",
    "requestId": "req_...",
    "retryable": false
  }
}
```

Codes:

- `BAD_REQUEST`
- `UNAUTHENTICATED`
- `FORBIDDEN`
- `TENANT_FORBIDDEN`
- `NOT_FOUND`
- `CONFLICT`
- `RATE_LIMITED`
- `QUOTA_EXCEEDED`
- `PROVIDER_UNAVAILABLE`
- `QUEUE_UNAVAILABLE`
- `INTERNAL`

## Lifecycle states

Asset/job status must use only:

- `requested`
- `queued`
- `processing`
- `rendered`
- `stored`
- `published`
- `failed`
- `archived`

Terminal states: `published`, `failed`, `archived`.

## `GET /api/health`

Public health check. Must never expose secrets, tenant data, provider credentials, raw environment variables, or private bucket paths.

### Response 200

```json
{
  "ok": true,
  "status": "healthy",
  "service": "asset-factory",
  "version": "asset-factory-api-v1",
  "updatedAt": 1760000000000,
  "checks": {
    "functions": true,
    "firestore": true,
    "storage": "redacted",
    "providers": "redacted"
  }
}
```

## `POST /api/assets`

Creates or accepts an Asset Factory asset request. This is the bridge used by Core and Life Map systems that need a durable asset request without directly invoking Studio internals.

### Request

```json
{
  "projectId": "urai",
  "assetType": "graphic",
  "format": "png",
  "prompt": "Symbolic aura bloom for a recovery moment",
  "tags": ["urai", "life-map", "recovery"],
  "dimensions": { "width": 1440, "height": 3120 },
  "source": "urai-core",
  "linkedLifeMapEventId": "event_123"
}
```

`userId` and `anonymousSessionId` are local-proof compatibility fields only. In staging/production, identity must resolve from the authenticated principal.

### Response 202

```json
{
  "ok": true,
  "assetId": "asset_123",
  "queueId": "queue_123",
  "status": "queued",
  "storagePath": "tenants/tenant_123/assets/asset_123/manifest.json",
  "requestId": "req_123"
}
```

## `GET /api/assets/{assetId}`

Returns tenant-scoped asset status. Cross-tenant access must return `403 TENANT_FORBIDDEN`, not `404`, in authenticated staging/production contexts where the asset exists but belongs to another tenant.

### Response 200

```json
{
  "ok": true,
  "asset": {
    "assetId": "asset_123",
    "tenantId": "tenant_123",
    "projectId": "urai",
    "assetType": "graphic",
    "format": "png",
    "status": "queued",
    "lifecycleState": "queued",
    "storagePath": "tenants/tenant_123/assets/asset_123/manifest.json",
    "createdAt": 1760000000000,
    "updatedAt": 1760000000000,
    "version": "1.0.0"
  },
  "requestId": "req_123"
}
```

## `POST /api/lifemap/events`

Accepts a symbolic Life Map event and links it to asset generation when applicable.

### Request

```json
{
  "eventId": "event_123",
  "type": "memory.bloom.requested",
  "timestamp": 1760000000000,
  "source": "urai-core",
  "linkedAssetId": "asset_123",
  "payload": {
    "chapterHint": "Recovery",
    "symbolicTags": ["aura", "bloom", "threshold"]
  }
}
```

`userId` is local-proof compatibility only. Staging/production user identity must resolve from the authenticated principal.

### Response 202

```json
{
  "ok": true,
  "eventId": "event_123",
  "status": "accepted",
  "requestId": "req_123"
}
```

## Studio generation contract

The Studio multimodal route surface must continue to support the proof flow:

1. `POST /api/generate`
2. `POST /api/jobs/:jobId/materialize`
3. `GET /api/generated-assets/:file`
4. `POST /api/jobs/:jobId/publish`
5. `POST /api/jobs/:jobId/approve`

Production provider-backed generation must preserve the same manifest and lifecycle semantics as local proof mode.

## Idempotency

- Mutating requests with the same `Idempotency-Key`, tenant, route, and normalized body must return the same accepted job/asset when the original request succeeded or is still in progress.
- Conflicting bodies under the same key must return `409 CONFLICT`.
- Idempotency records must be tenant-scoped and retained for at least 24 hours.

## Queue and worker requirements

- Queue claims must use leases.
- Workers must be idempotent.
- Retryable provider failures must retry with bounded attempts.
- Permanent failures must transition to `failed` and write a dead-letter record.
- Stale `processing` jobs must be recoverable or dead-lettered.
- Queue/DLQ operations require `operator` role or worker secret.

## Billing and entitlement requirements

- Quota must be checked before accepting paid/provider-backed jobs.
- Stripe webhook events must be signature-verified and persisted idempotently.
- Tenant entitlements must be durable and auditable.
- Usage records must include tenant, asset/job ID, modality, provider/model, estimated cost class, createdAt, and requestId.

## Observability requirements

Every production path must emit:

- request ID
- route
- method
- tenant ID hash or safe tenant ID
- user ID hash or safe user ID
- lifecycle transition
- queue ID/job ID/asset ID where applicable
- provider/model where applicable
- retryable/permanent failure classification

## Completion rule

The API contract is locked only when implementation, automated tests, staging smoke, production smoke, operations docs, OpenAPI, and UrAiProd dependency records all reference the same version and pass with linked evidence.
