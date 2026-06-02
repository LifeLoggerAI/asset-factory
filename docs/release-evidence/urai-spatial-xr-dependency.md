# URAI Spatial XR Dependency Evidence Gate

This evidence file records what `LifeLoggerAI/asset-factory` must prove before `LifeLoggerAI/urai-spatial` can claim production AR/VR/XR readiness.

## Current status

- Dependency status: `not-production-locked-for-xr`.
- Canonical consumer: `LifeLoggerAI/urai-spatial`.
- Current supported repo mode: deterministic local proof renderers for `graphic`, `model3d`, `audio`, and `bundle`.
- Production XR claim status: blocked until staging and production evidence in `LAUNCH_READINESS.md` and issue #63 is complete.

## Required XR evidence before URAI Spatial may claim provider-backed XR assets

| Gate | Required evidence | Result | Notes |
| --- | --- | --- | --- |
| Provider-backed generation | Production provider run with local proof fallback disabled | Not recorded | Required before Quest/WebXR/visionOS asset-generation claims. |
| Cross-tenant denial | Staging and production proof that tenant A cannot read/write tenant B assets | Not recorded | Required before any user-owned spatial asset claim. |
| Queue/DLQ | Durable queue, retry, and DLQ evidence for long-running generation | Not recorded | Required before large 3D/audio/bundle workloads are production-backed. |
| Signed webhook/idempotency | Signed webhook validation and duplicate-delivery proof | Not recorded | Required before provider callback claims. |
| Diagnostics redaction | Logs/screenshots showing secrets, prompts, and private payloads redacted | Not recorded | Required before attaching evidence to release packets. |
| Asset approval | Approved artifact manifest with renderer version, content hash, storage path, and approval status | Not recorded | Required before publishing XR assets into URAI Spatial. |
| Rollback | Rollback SHA/procedure for provider-backed asset pipeline | Not recorded | Required before production rollout. |
| Owner approval | Owner approval recorded in issue #63 or release notes | Not recorded | Required before unblocking URAI Spatial provider claims. |

## Integration contract for URAI Spatial

`urai-spatial` must continue treating Asset Factory as `Not recorded` or `Not validated` in `EVIDENCE.md` until this repo provides:

1. Passing `npm run test:launch-readiness` output.
2. Passing `npm run test:completion-lock` output.
3. Staging smoke evidence for generate -> materialize -> fetch -> publish -> approve.
4. Production smoke evidence for the verified Firebase API base or a custom domain after the documented custom-domain blocker closes.
5. Provider-backed asset evidence with fallback disabled.
6. Cross-tenant denial evidence.
7. Owner approval.

## Release decision

Do not use this file to mark Asset Factory production-live. It is a dependency ledger for URAI Spatial. The authoritative production lock remains `LAUNCH_READINESS.md`, `docs/OPERATIONS_RUNBOOK.md`, release evidence under `docs/release-evidence/`, and issue #63.
