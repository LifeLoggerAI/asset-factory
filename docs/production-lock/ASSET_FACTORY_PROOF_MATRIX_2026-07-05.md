# Asset Factory Production Proof Matrix - 2026-07-05

Status: `EXECUTION_READY_NOT_LOCKED`

This matrix converts the remaining Asset Factory lock work into executable audit tasks. It is evidence-first: no gate is complete because a document says it is complete; a gate is complete only when the live artifact proves it.

## 1. Live workflow proof

| Proof | How to prove | Required artifact | Pass condition |
| --- | --- | --- | --- |
| Staging readonly | Run the documented staging readonly workflow path | GitHub Actions run log and uploaded smoke artifact | Health/routes reachable; no mutation required; no sensitive values printed |
| Staging deploy | Run the documented staging deploy/authenticated smoke path | GitHub Actions run log, deploy output, authenticated smoke artifact | Fallback disabled; authenticated routes pass; protected routes remain protected |
| Production readonly | Run the documented production readonly smoke path | GitHub Actions run log and smoke artifact | Production health/routes respond safely without mutation |
| Production deploy | Run the documented production deploy/authenticated smoke path | GitHub Actions run log, deploy output, production smoke artifact | Production deploy succeeds; smoke passes; sensitive values are not printed |

## 2. Security and tenancy proof

| Proof | Required evidence |
| --- | --- |
| API authentication and role enforcement | Evidence that protected routes require approved credentials and reject unauthorized access |
| Tenant isolation | Evidence that one tenant cannot read or modify another tenant's jobs, manifests, files, queue entries, or billing state |
| Diagnostics protection | Evidence that public diagnostics are redacted and full diagnostics require approved access |
| Scheduled route protection | Evidence that scheduled/maintenance routes require the documented production guard |
| No sensitive output leakage | Workflow logs and artifacts reviewed for token, secret, key, and credential leakage |

## 3. Worker and queue proof

| Proof | Required evidence |
| --- | --- |
| Lease behavior | Job state shows a single worker claim, lease owner, and lease timestamp |
| Retry behavior | Retryable failure evidence shows retry count and recoverable job state |
| Idempotency | Duplicate request or job key does not create duplicate durable outputs |
| Dead-letter behavior | Terminal failure creates a dead-letter record with reason and source job |
| Cleanup and retention | Cleanup path handles expired leases or old artifacts without deleting active jobs |
| Worker health | Worker health record or endpoint shows healthy state, queue depth, and recent heartbeat |

## 4. Billing proof

| Proof | Required evidence |
| --- | --- |
| Webhook authenticity | Evidence that billing events are verified before entitlement changes are persisted |
| Idempotent entitlement persistence | Replayed billing event updates entitlement once or is marked as an already-processed event |
| Tenant billing isolation | Evidence that billing state is scoped to the owning tenant |
| Billing observability | Dashboard or logs show billing success/failure metrics |

## 5. Provider asset proof

| Version | Required proof | Current lock status |
| --- | --- | --- |
| V2 | Provider forge run produces 80 passed assets, receipt status passed, handoff missing 0, Spatial promotion branch/PR opened | `PENDING_PROVIDER_RECEIPT` |
| V3 | Exact 14 provider assets, no fallback certification, Spatial gate activates only with exact receipt | `PENDING_PROVIDER_RECEIPT` |
| V4 | Exact 39 provider assets, no fallback certification, Spatial gate activates only with exact receipt | `PENDING_PROVIDER_RECEIPT` |

## 6. Observability proof

Required dashboard/log links:

- Health and uptime
- Latency
- Queue depth
- Dead-letter count
- Provider failures
- Billing failures
- Storage errors
- Spend and cost caps
- Deployment history
- Rollback target

## 7. Rollback proof

Required fields:

```text
last_known_good_sha:
deploy_target:
deploy_command:
rollback_command:
rollback_owner:
owner_approval_link:
```

Pass condition: a second operator can use the record to roll back without guessing.

## 8. UrAi/UrAiProd dependency rule

Do not update UrAi or UrAiProd to consume Asset Factory as locked until:

1. `docs/contracts/ASSET_FACTORY_COMPLETION_LOCK.md` is changed to `LOCKED`.
2. This matrix has evidence for every live gate.
3. The release evidence file has no `TBD` rows for P0 gates.
4. Issue #63 is updated with links to workflow artifacts and owner approval.

Until then, consumers must keep Asset Factory behind a feature flag with timeout, retry, fallback, and rollback behavior.
