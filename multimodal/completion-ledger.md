# URAI Full Multimodal Asset Completion Ledger

Verified source locks:

- Asset Factory base: `db92abe76daa25a5a8f101758fcefd5729ae81e8`
- Spatial main: `4457b32eb80e70e583713cb1f73e0ff628b134a3`
- Spatial release candidate: `e8f089700142233d8954006b73a674d5d87a0228`
- Spatial protected-release follow-up: `57c06be70f14c6048be6a3516eb510793bb5d5f7`

The canonical manifest is generated from source contracts during CI; the obsolete seven-pack checked-in snapshot was removed.

| Lane | Required records | Certified | Current truth |
|---|---:|---:|---|
| Visual | 213 | 0 | Canonical V1-V5 contracts exist; provider outputs and promotion receipts are unproven. |
| 3D | 11 | 0 | Locked Spatial manifest entries are candidates pending binary, compression, review, and promotion proof. |
| Audio | 31 | 0 | Thirty route-specific records plus one locked Spatial ambient bed; outputs, licensing, mastering, and consent remain unproven. |
| Film | 12 | 0 | Replay manifests, captions, description, frames, and exports are specified but not produced or certified. |
| Accessibility | 72 | 0 | Six requirements across twelve routes; route-level evidence remains missing. |
| Governance | 10 | 0 | Required rights records exist and remain blocked until source and review evidence is attached. |
| Runtime | 13 | 0 | Build, smoke, screenshots, performance, accessibility, exact release, rollback, protected deploy, and live verification remain unproven. |
| **Total** | **362** | **0** | **Release blocked.** |

## Completed repository work

- Exact-head and locked cross-repository checkouts.
- Repository-aware output resolution.
- Exact audio and film technical specifications.
- Route-specific audio mapping.
- Full lifecycle manifest contract v1.2.
- Fail-closed rights and consent validation.
- Explicit paid-provider enablement, approval ID, and positive cost ceiling gate.
- Zero-spend missing-only dispatch planning.
- Immutable audit artifact configuration.

## External blockers

1. GitHub Actions runners must execute the queued exact-head workflows and produce artifacts.
2. Paid generation requires a selected provider/model and explicit bounded approval.
3. Rights, attribution, commercial-use, ownership, retention, deletion, export, and revocation evidence must be supplied where applicable.
4. Human creative review and promotion approval must occur for produced media.
5. Production merge and deployment require explicit authorization after checks pass.
6. Exact deployed SHA, distinct rollback SHA, live route proof, and physical XR evidence remain external release gates.

## Release rule

No asset is certified without checksum, provenance, technical report, rights clearance, approved review, merged promotion, exact release SHA, distinct rollback SHA, and live verification evidence. No paid call, merge, or deployment is authorized by this ledger.
