# Firestore Rules Tier 1 Verification Spec

This spec defines the emulator checks required before URAI Tier 1 can be marked locked.

## Required pass cases

- Authenticated user can read their own `tenants/{uid}` document.
- Authenticated user can read their own `jobs/{jobId}` document when `ownerId == uid`.
- Authenticated user can create a pending job only when `ownerId == uid` and `status == "pending"`.
- Authenticated user can read their own `exports/{exportId}` document.
- Authenticated user can create their own `delete_requests/{requestId}` only when `ownerId == uid`, `targetUserId == uid`, and `status == "requested"`.
- Any user can read `demo_public/{demoId}` only when the existing document is synthetic and demo-only.

## Required deny cases

- Unauthenticated users cannot read or write private user data.
- Users cannot read another user's tenant, jobs, usage ledger, dead jobs, consent snapshots, consent ledger, exports, delete requests, timeline events, or narrator reflections.
- Users cannot write tenants, usage ledger, consent snapshots, consent ledger, feature flags, exports, timeline events, narrator reflections, system metrics, or billing audit documents.
- Users cannot update or delete jobs after creation.
- Users cannot create jobs for another user.
- Users cannot create non-pending jobs.
- Public demo documents cannot be written by clients.
- Unknown collections are denied by the catch-all rule.

## Tier 1 lock rule

Tier 1 fails if these emulator tests do not exist as executable tests in CI. This markdown file is the audit specification; it must be converted to executable emulator tests if the repo does not already have a rules test runner.
