# URAI Tier 1 Audit Report

Branch: `tier-one-lock-audit`  
Scope: URAI / Asset Factory Tier 1 Lock implementation  
Status: **Implemented as a reviewable Tier 1 Lock PR, not yet production-locked until CI/emulator/deploy verification passes.**

## 1. What was broken

- URAI Tier 1 did not have a repo-level canon defining what is allowed, disabled, consent-gated, server-gated, or blocked from public launch.
- High-risk feature areas were not represented as enforceable code-level policy boundaries.
- Feature flags were not tied to the Tier 1 safety canon.
- Consent requirements were not modeled as a reusable ledger/snapshot enforcement layer.
- Narrator safety requirements were not represented as code-level guardrails.
- Demo isolation was not encoded as synthetic-only data helpers.
- Export/delete verification was not represented as Tier 1 user-control helpers.
- Firebase rules did not explicitly model consent, demo, timeline, narrator, export/delete, or feature-flag boundaries.
- Storage rules had broad user-profile public read behavior and lacked an explicit catch-all deny posture.

## 2. What was missing

Added:

- `src/lib/tier-locks/tier-one-canon.ts`
- `src/lib/feature-flags/urai-feature-flags.ts`
- `src/lib/privacy/consent-types.ts`
- `src/lib/privacy/consent-ledger.ts`
- `src/lib/ai/safety-policy.ts`
- `src/lib/ai/narrator-guardrails.ts`
- `src/lib/demo/synthetic-demo-data.ts`
- `src/lib/privacy/export-delete-verification.ts`
- `tests/tier-locks/tier-one-canon.test.ts`
- `tests/feature-flags/urai-feature-flags.test.ts`
- `tests/privacy/consent-ledger.test.ts`
- `tests/privacy/export-delete-verification.test.ts`
- `tests/ai/narrator-safety.test.ts`
- `tests/demo/synthetic-demo-mode.test.ts`
- `tests/firebase/firestore.rules.test.md`
- `tests/firebase/storage.rules.test.md`
- `docs/TIER_ONE_AUDIT_REPORT.md`

Updated:

- `firestore.rules`
- `storage.rules`

## 3. What was unsafe

Tier 1 unsafe or high-risk systems are now explicitly blocked in canon and feature flags:

- Deception detection
- Trust scoring
- Facial intelligence
- Voiceprints
- Data marketplace
- Crisis prediction
- Adolescent self-harm prediction
- Employer individual analytics
- Deep shadow mode
- AR/VR as core launch scope

Banned public copy now includes:

- lie detection
- betrayal detection
- trust score
- predicts crisis
- diagnoses mood
- detects mental illness
- reads your face
- knows if someone is lying
- sells your emotional data
- AI therapist

## 4. What was fixed

### Tier 1 canon

Created a canonical Tier 1 policy file that defines:

- Safe core features
- Disabled/high-risk features
- Public launch rules
- Explicit-consent requirements
- Server-side gate requirements
- Public copy bans
- Safe language for emotional weather, narrator, timeline, and privacy

### Feature flags

Created feature flags that:

- Import the Tier 1 canon
- Enable only safe core systems by default
- Disable blocked systems in production
- Provide assertion helpers for UI, route, function, and server gate enforcement

### Consent ledger

Created reusable consent primitives for:

- Consent schema version
- Consent snapshots
- Ledger entries
- Grant/revoke state
- Data categories
- Processing purposes
- Revocation path
- Sensitive processing enforcement

### Narrator safety

Created AI safety policy and narrator guardrails that block:

- Diagnosis
- Clinical claims
- Certainty claims
- Deception accusations
- Trust scoring
- Crisis-prediction claims
- Manipulative/dependency language
- Symbolic interpretation presented as fact

Narrator outputs now require:

- Model version
- Prompt version
- Confidence level
- Safety level
- Source signal categories
- User-dismissable framing

### Firebase rules

Firestore rules now explicitly cover:

- Tenants
- Jobs
- Usage ledger
- Dead jobs
- Consent ledger
- Consent snapshots
- Feature flags
- Exports
- Delete requests
- Demo public data
- Timeline events
- Narrator reflections
- System metrics
- Billing audit
- Catch-all deny

Storage rules now explicitly cover:

- Private assets
- Exports
- Synthetic demo files
- User profile files
- Content-type and size limits
- Catch-all deny

### Synthetic demo isolation

Created synthetic demo helpers requiring:

- `ownerId === "synthetic-demo"`
- `demoMode === true`
- `isSynthetic === true`
- synthetic source version

### Export/delete verification

Created export/delete helpers requiring:

- Owner and target user match
- Request versioning
- Valid status
- Declared data categories
- Tier 1 export/delete feature flag enabled

## 5. What tests passed

Not run in this environment.

The following test/spec files were added for CI or local execution:

- `tests/tier-locks/tier-one-canon.test.ts`
- `tests/feature-flags/urai-feature-flags.test.ts`
- `tests/privacy/consent-ledger.test.ts`
- `tests/privacy/export-delete-verification.test.ts`
- `tests/ai/narrator-safety.test.ts`
- `tests/demo/synthetic-demo-mode.test.ts`
- `tests/firebase/firestore.rules.test.md`
- `tests/firebase/storage.rules.test.md`

Required local/CI commands before Tier 1 can be marked locked:

```bash
npm run typecheck
npm run lint
npm run test
npm run test:rules
npm run build
npm run audit:tier-one
```

## 6. What still blocks Tier 1

Tier 1 is **not yet production locked** until all of the following are proven:

- TypeScript test files are wired into the repo's actual test runner.
- Firebase rules markdown specs are converted to executable emulator tests if no runner already exists.
- `npm run typecheck` passes.
- `npm run lint` passes or is added if missing.
- `npm run test` passes.
- `npm run test:rules` passes or is added.
- `npm run build` passes.
- `npm run audit:tier-one` exists and passes.
- Export/delete helpers are wired into production functions or routes.
- Consent ledger helpers are wired into sensitive processing paths.
- Feature-flag assertions are used in UI/routes/functions before high-risk systems can render or run.
- Narrator safety helpers are used before generated text reaches users.
- Firebase emulator tests prove unauthorized reads/writes are denied.
- Deployment and smoke tests pass.

## 7. Whether URAI is Tier 1 locked

**No.**

URAI now has the Tier 1 Lock implementation foundation on this branch, but the project must not be declared Tier 1 complete until the repo's actual CI, emulator tests, build, Firebase deploy, and smoke tests pass.

Final current status:

> **Tier 1 Lock foundation implemented. Production lock pending CI, emulator, integration, deploy, and smoke-test proof.**
