# Changelog

All notable Asset Factory audit, release, and verification changes should be recorded here.

## 2026-05-17 - System audit documentation

Status: PARTIALLY VERIFIED / BLOCKED

### Added

- `docs/SYSTEM_AUDIT.md` documenting the system-of-systems audit result.
- `docs/COMPLETION_CHECKLIST.md` documenting done-means-done verification gates.
- `docs/DEPLOYMENT_VERIFICATION.md` documenting Firebase/default-domain/custom-domain/staging verification requirements.
- `docs/PRIVACY_SAFETY_VERIFICATION.md` documenting privacy, safety, banned-claim, diagnostics, auth, tenancy, and legal/support gates.

### Verified by repository evidence

- Current source-of-truth files exist for launch readiness, completion lock, API contract, operations runbook, and release evidence.
- Firebase default API base is recorded as verified at `https://urai-4dc1d.web.app`.
- The full Asset Factory product system remains `NOT LOCKED` / `NOT_PRODUCTION_READY` until all P0 gates pass with evidence.

### Blocked

- Custom-domain API smoke and evidence must be current and committed.
- Staging smoke with local fallback disabled remains required.
- Full auth/JWT/API-key/tenant/role enforcement proof remains required.
- Cross-tenant denial proof remains required.
- Real provider-backed generation proof remains required.
- Durable worker queue lease/retry/idempotency/DLQ proof remains required.
- Stripe entitlement persistence proof remains required.
- Observability and rollback proof remain required.
- Legal/privacy/security/support/account deletion/export review remains required.

### Audit limitation

Direct live endpoint checks could not be completed from the audit sandbox because public hostnames did not resolve there. CI or an operator workstation with production secrets must run the smoke commands and commit evidence.
