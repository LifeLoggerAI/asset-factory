# Asset Factory Release Evidence

Use this template for every staging or production launch decision. Paste completed copies into `docs/release-evidence/YYYY-MM-DD-environment.md` or attach them to issue #63.

This template is aligned with `scripts/check-release-evidence.mjs`. Do not change the field names in the machine-readable block unless the validator is updated in the same PR.

## Release identity

- Environment:
- Repo: `LifeLoggerAI/asset-factory`
- Branch:
- Commit SHA:
- Contract version: `asset-factory-api-v1`
- Release owner:
- Reviewers:
- Date/time UTC:
- Workflow run URL:
- Artifact URL:

## Machine-readable release block

Replace every placeholder before running validation. Do not literally run a command with `<file>` in it; Bash treats angle brackets as redirection.

Validate a specific completed evidence file:

```bash
npm run check:release-evidence -- docs/release-evidence/YYYY-MM-DD-environment.md
```

Or validate the newest markdown evidence file in `docs/release-evidence/`:

```bash
npm run check:release-evidence:latest
```

```yaml
release:
  repo: LifeLoggerAI/asset-factory
  branch: main
  commit: <git-sha>
  api_contract_version: asset-factory-api-v1
  local_proof_run: <url-or-docs/release-evidence/path>
  staging_smoke_run: <url-or-docs/release-evidence/path>
  production_smoke_run: <url-or-docs/release-evidence/path>
  firebase_project: urai-4dc1d
  staging_url: https://staging.uraiassetfactory.com
  production_url: https://www.uraiassetfactory.com
  fallback_disabled: true
  auth_required: true
  api_key_required: true
  tenant_isolation_verified: true
  provider_generation_verified: true
  worker_queue_verified: true
  stripe_entitlements_verified: true
  diagnostics_redacted: true
  cron_secret_verified: true
  observability_verified: true
  legal_pages_verified: true
  rollback_sha: <git-sha>
  owner: <name>
```

## Status summary

| Area | Required value | Actual value | Evidence |
| --- | --- | --- | --- |
| Local fallback disabled | `true` for staging/prod |  |  |
| Auth required | `true` |  |  |
| API key required | `true` for protected mutating routes/full diagnostics |  |  |
| Tenant isolation verified | `true` |  |  |
| Provider generation verified | `true` for launch asset types |  |  |
| Durable worker verified | `true` |  |  |
| Stripe entitlements verified | `true` |  |  |
| Diagnostics redacted | `true` |  |  |
| Cron secret enforced | `true` |  |  |
| Observability verified | `true` |  |  |
| Website/legal/trust/status verified | `true` |  |  |
| Rollback SHA recorded | `true` |  |  |

## Preferred GitHub Actions evidence path

Use the manual workflow unless debugging a failed run locally:

```text
Actions -> Deploy Asset Factory -> Run workflow
```

Required sequence:

```text
staging / deploy=false / smoke_mode=readonly
staging / deploy=true / smoke_mode=both
production / deploy=false / smoke_mode=readonly
production / deploy=true / smoke_mode=both
```

Required environment/repository secrets are documented in `docs/OPERATIONS_RUNBOOK.md` and issue #63.

## Commands and outputs

Prefer the GitHub Actions workflow artifact. If debugging manually, use the exact command blocks in `docs/OPERATIONS_RUNBOOK.md` rather than copying commands from this template.

### Local proof

Evidence:

```text
<paste output or link CI run>
```

### Staging read-only smoke

Evidence:

```text
<paste output or link CI run>
```

### Staging authenticated smoke

Evidence:

```text
<paste output or link CI run>
```

### Production read-only smoke

Evidence:

```text
<paste output or link CI run>
```

### Production authenticated smoke

Evidence:

```text
<paste output or link CI run>
```

### Custom-domain smoke after DNS/API routing is fixed

Evidence:

```text
<paste output or link CI run>
```

## Endpoint proof

| Endpoint | Expected | Actual | Evidence |
| --- | --- | --- | --- |
| `GET /api/system/health` | 200 redacted healthy/degraded |  |  |
| `GET /api/health` | 200 compatibility alias |  |  |
| `POST /api/assets` | 202 queued |  |  |
| `GET /api/assets/{assetId}` | 200 own tenant, 403 other tenant |  |  |
| `POST /api/lifemap/events` | 202 accepted |  |  |
| `POST /api/generate` | job created |  |  |
| `POST /api/jobs/:jobId/materialize` | output materialized |  |  |
| `GET /api/generated-assets/:file` | own tenant allowed, other tenant denied |  |  |
| `POST /api/jobs/:jobId/publish` | published |  |  |
| `POST /api/jobs/:jobId/approve` | approved |  |  |
| Stripe webhook unsigned | rejected |  |  |
| Stripe webhook signed | persisted idempotently |  |  |
| Cron missing/wrong secret | rejected |  |  |
| Cron correct secret | accepted |  |  |
| Admin queue read | tenant-scoped/all-tenant authorized only |  |  |
| Admin queue requeue | authorized/admin only |  |  |
| Account export | authorized tenant admin only |  |  |
| Account deletion request | recorded for manual review |  |  |

## Output inventory proof

### Generated asset outputs

- Graphic:
- 3D model:
- Audio:
- Bundle:

### Data records

- `assetFactoryRequests`:
- `assetFactoryQueue`:
- `assetManifests`:
- generated job records:
- usage records:
- entitlement records:
- dead-letter records:
- system status records:
- Life Map records:

### Storage paths

- Private tenant path:
- Public published path:
- Signed/private download proof:
- Cross-tenant denial proof:

## Observability proof

- Request ID visible:
- Structured logs visible:
- Error tracking visible:
- Queue depth visible:
- DLQ visible:
- Provider spend visible:
- Uptime check visible:
- Incident/support path verified:

## Rollback

- Last known-good SHA:
- Rollback command:
- Feature flag kill switch:
- Core rollback path:

## Validation

Final evidence must pass one of:

```bash
npm run check:release-evidence -- docs/release-evidence/YYYY-MM-DD-environment.md
npm run check:release-evidence:latest
```

## Decision

- [ ] Do not release
- [ ] Release to staging only
- [ ] Release to production behind feature flag
- [ ] Release to production as locked dependency

Decision rationale:

```text
<write final release rationale>
```