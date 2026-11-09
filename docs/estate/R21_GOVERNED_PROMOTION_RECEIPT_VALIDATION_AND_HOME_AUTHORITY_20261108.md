# ONE URAI GENESIS — Asset Factory R21: governed promotion receipt custody regression

**Observed:** 2026-11-08 America/Chicago / 2026-11-09 UTC. **Disposition: review-only, production HOLD.** Additive audit to Asset Factory draft PR #497 stacked on #496. Not a production implementation, full pipeline bypass, deployment authorization or visual approval.

## Source anchors and chain of custody

- Current Spatial main: `da94837c2457b0a7590e26a7a644cd728de8afb8` unchanged during audit.
- Exact `scripts/verify-governed-asset-promotion.mjs` source Git blob `5d818de78f4ea3f2c7dc77e42dca9c505de2e73b` (8,403 bytes). The source fetched from connected GitHub was **reconstituted locally and verified with `git hash-object` against the exact blob**; Node 22.16.0 syntax check PASS.
- Governing workflow: `.github/workflows/governed-asset-promotion.yml` blob `5e983e7ef216da4e3ebf139bf53bd29abbc5ae4d` and `.github/workflows/launch-critical-asset-forge.yml` blob `2981ef949d304996cb4cd6d08399842c7eb054c9`; related original contract tests `urai-tier1/tests/material-pack-schema-repair-governance.test.mjs` blob `4c1c55e5e1f2e03ac7487f24da6ea1f3dac50c19`, `urai-tier1/tests/home-entry-governed-production-contract.test.mjs` blob `6e2a057d409610f5fbad280ab83029b65ad1b7b7`.
- The verifier already checks decision mode, asset existence, decision file SHA-256/bytes, different *string values* for producer and reviewer, boolean decision approvals, canonical asset path, pending/production manifest state and receipt **file existence**. It does **not** open/read/validate the receipt in the promotion branch at current main.

## Actual exact-source 25-case isolated regression

Run in isolated temporary directories with synthetic test-only bytes, fake producer/reviewer identities and node child processes. No real media, provider calls, network, deployed services or original tracked files were mutated.

- Original Git-blob-verified source: **25/25 predicted outcomes reproduced**; 20 accepted = 2 valid cases + **18 invalid receipt cases**. Rejected 5 negative cases covering nonexistent receipt, mismatched changed asset bytes, producer/reviewer equality, pending manifest when promoting, and invalid receipt path with no file.
- Confirmed false acceptances include **empty receipt file**, malformed JSON, directory at receipt path, receipt symlink, wrong `id`, wrong `sha256`, wrong `bytes`, wrong `source`, wrong `license`, wrong `fixedPath`, candidate receipt release state, explicit visual rejection, missing visual proof, `deploymentAuthorized:false`, arbitrary other existing receipt path, JSON object `{}`, JSON array, and JSON null.
- These are **verifier-level fail-open receipt custody defects**, not a demonstrated exploit of the end-to-end governed workflow or evidence of an actual unreviewed deployment.

The original complete fixture results are recorded in local handoff `reports/R21_ORIGINAL_GOVERNED_RECEIPT_TESTS.json`.

## Review-only patch and fresh negative tests

A minimal owner-review proposal was saved **only as text in the audit PR** at `docs/estate/proposals/R21_REVIEW_ONLY_GOVERNED_RECEIPT_CONTENT_VALIDATION.patch`. Exact patch: **3,347 bytes**, SHA-256 `ce2ca3a5bd2b008ddfcdb56d3e68b3a82e37f4f98536c5ce19be8b41d8cd4f99`, Git blob `513b1fc47a700445f3cfe4c9fa90b10a079915c4` (GitHub readback confirmed). The patch:
- Requires `decision.receiptPath` to be the canonical `operations/assets/production-receipts/<manifest-asset-id>.json` path;
- Rejects unsafe/nonregular/symlink receipt and checks resolved containment inside the source tree;
- Parses the receipt JSON as a real non-null object and checks receipt `id`, `fixedPath`, `bytes`, `sha256`, `source`, `license`, `releaseState:'production-ready'` against the approved asset and decision;
- Requires `receipt.visualAcceptance.accepted:true` and `receipt.deploymentAuthorized:true` for promotion.
- Does **not** change rehearsal authority or call a paid service, and never promotes a candidate merely for satisfying an isolated receipt check.

Local `git apply --check`, actual `git apply`, exact candidate byte comparison and `node --check` passed. Proposed patched source SHA-256 `eb3426e6f8876ee0e050935f287d31924b4b871404fcf466bb08f08ee0adaa1f`, Git blob `56073091d743e35926d47421c457333a09ec8445`. **25/25 patched test-case outcomes reproduced**: the two valid synthetic cases accept, all 23 negative cases reject. This is a synthetic source-level check, not native all-repo CI.

Additionally, the existing real `spatial-particle-atlas-v1` asset and rehearsal decision were independently reproduced from GitHub with exact original **Git blob identities** `01619446bda48079be7d0243d523af43e8faf853` (622-byte SVG) and `5725c4bd5c594153e5d6fe6b0b67c35ff7bcea23` (987-byte decision). They passed the **original and patched** verifiers in isolated fixture roots with `GOVERNED_ASSET_PROMOTION=GREEN`, `MODE=rehearsal`, `PROMOTE=false`. That test does not exercise actual production receipt acceptance or full original source repository tests.

## Reconciliation: old Home production records must not authorize the present Home binary

At fixed current Spatial main:
- Current launch-critical manifest Home state: **`pending-final-review`**, policy forbids candidates shipping.
- Current generated Home receipt: **1,786,808 bytes**, SHA-256 `73f2a49ed2cfd6cd7ae9baed7b3908d53e0cac75b9f36ff1b8be9654e3d3e2f2`, `candidate-not-production-ready`.
- Historical `operations/assets/promotion-decisions/home-entry-chamber-v1.json` still says `mode:'promotion'`, with `promote:true` for **184,160 bytes**, SHA-256 `b7bdced5a721598a9dfe592ee19da04d754d5b8b1d48b23cc44403a89b1ee529`.
- Historical production receipt `operations/assets/production-receipts/home-entry-chamber-v1.json` uses that same **older** SHA-256 and **184,160 bytes**, `releaseState:'production-ready'`, visual acceptance true.
- Current rehearsal decision uses **1,786,808 bytes** and correct candidate SHA but remains `promote:false`, human review false, visual proof false.
- Active Home source at `urai-tier1/src/spatial/layout/HomeWorldProductionPolished.tsx` still loads `/assets/urai/generated/models/home-entry-chamber-v1.glb`; the runtime `assetPromotionState.ts` labels Home in a promoted-IDs set while the launch manifest says pending. This is a **runtime-label versus formal-release-authority conflict**; the historical approval record is stale for the current asset. The live deployment itself was not accessed in this pass.

**Do not erase the historic production record**: preserve it as a dated approved prior binary and explicitly supersede or reconcile it with a new approved decision and independent proof if an owner elects to promote current Home. Do not backdate visual acceptance or infer approval solely from a source-rendered model.

## Patch limitations and next owner review

The patch verifies receipt content consistency and declared approval states, **not authentic signatories**, actual independent human review, cryptographic attestation from an external authority, immutable head-binding across all evidence, full glTF compression/animation, real browser/GPU rendering, rights, or authenticated Privacy→Studio→Jobs→Replay→revocation/deletion. A malicious actor able to edit all decision and receipt fields can still write mutually consistent claims; protected review and source-pinned signed evidence are independent controls. In an unusual concurrent delete/rename race of the receipt path after `existsSync`, the verifier may throw rather than emit a structured RED; it still does not return a false GREEN.

Have Spatial owner reconcile this patch with R19 source-verifier hardening and older R9/R11/R13 compression/receipt/promotion proposals, then add native protected CI on the **final exact merge candidate**, independent approval and current Home release action. The eight larger current GLB source bodies, independent visual/device/XR acceptance, commercial licensing, provider task custody and cross-service consent/deletion remain pending.

**Evidence-only R21. Main and owner PRs untouched; no paid compute, provider generation, user data, IAM mutation, merge or deploy. ONE URAI GENESIS PRODUCTION HOLD.**
