# Storage Rules Tier 1 Verification Spec

This spec defines the emulator checks required before URAI Tier 1 can be marked locked.

## Required pass cases

- Authenticated user can read files below `assets/{uid}/{jobId}/...` only for their own uid.
- Authenticated user can upload allowed asset content types below `assets/{uid}/{jobId}/...` only for their own uid.
- Authenticated user can read files below `exports/{uid}/{exportId}/...` only for their own uid.
- Public users can read synthetic demo files below `synthetic-demo/{demoId}/...`.
- Authenticated user can read and upload their own profile files below `user_profiles/{uid}/...` with image content type and size limit.

## Required deny cases

- Unauthenticated users cannot read private assets, exports, or profile files.
- Users cannot read or write another user's asset, export, or profile paths.
- Clients cannot write export files.
- Clients cannot write synthetic demo files.
- Uploads above size limits are denied.
- Uploads with disallowed content types are denied.
- Unknown storage paths are denied by the catch-all rule.

## Tier 1 lock rule

Tier 1 fails if these emulator tests do not exist as executable tests in CI. This markdown file is the audit specification; it must be converted to executable emulator tests if the repo does not already have a rules test runner.
