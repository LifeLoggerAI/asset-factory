# ONE URAI GENESIS — Asset Factory R19: exact-source Spatial asset-release verification and owner-review patch

**Observed:** 2026-11-08 America/Chicago (2026-11-09 UTC). **Status:** independent audit evidence only; production **HOLD**. This report is added to draft Asset Factory PR #497, stacked on forensic PR #496. It does not modify `urai-spatial`, Factory owner #421, security #493, composite #494, CI protection, Firebase, provider accounts, media or deployed assets.

## Frozen source, history and execution boundary

- Spatial main `da94837c2457b0a7590e26a7a644cd728de8afb8`.
- Exact primary verifier `scripts/verify-launch-critical-assets.mjs`, source Git blob `11dc453dfab617fb9396232a38b638befa646c1c` (verified locally via `git hash-object`).
- Exact independent artifact auditor `scripts/audit-launch-critical-artifact.mjs`, source Git blob `eeb8d633d6989a61e423c62b94f59d021bf43e8b` (also matched locally).
- Reviewed existing governed promotion `scripts/verify-governed-asset-promotion.mjs` Git blob `5d818de78f4ea3f2c7dc77e42dca9c505de2e73b`. It separately requires promotion-mode true, manifest production-ready, human review, visual proof, existence of a production receipt, and SHA identity. This R19 report does **not** assert a bypass of the full governed release pipeline.
- Reviewed `.github/workflows/launch-critical-asset-forge.yml` Git blob `2981ef949d304996cb4cd6d08399842c7eb054c9`, which invokes primary verification in candidate and replacement workflows and has separate governed decision paths.
- Current canonical `operations/assets/launch-critical-assets.json`: **26 entries all `pending-final-review`**, with `candidateAssetsMayShip:false`. Read the **26 corresponding generated-receipt JSON records**: all remain `candidate-not-production-ready`. No current real asset was reclassified, approved, or promoted.

## Original exact-source negative/positive fixture results

Reconstituted and Git-blob-verified the two exact Spatial source scripts, then executed synthetic fixtures in isolated temporary directories with Node 22.16.0. No actual user media or original GLB/MP4 content was involved.

**14 executions (7 cases × 2 source scripts) returned the predicted outcomes:**

| Scenario | Original verifier | Original artifact audit | Interpretation |
| --- | --- | --- | --- |
| Empty manifest, zero assets | Exit 0 / `ok:true` | Exit 0 / `ok:true` | False success for a strict nonempty release-asset register |
| Valid pending candidate and receipt | Exit 0 | Exit 0 | Correct candidate verification (not production approval) |
| Manifest production-ready / receipt candidate | Exit 0 | Exit 0 | Contradictory authority states accepted |
| Manifest pending / receipt production-ready with noncandidate compression | Exit 0 | Exit 0 | Opposite contradictory authority states accepted |
| Production-ready receipt with candidate compression | Exit 1 | Exit 1 | Existing safe rejection preserved |
| Missing source asset | Exit 1 | Exit 1 | Existing safe rejection preserved |
| Incorrect source SHA-256 | Exit 1 | Exit 1 | Existing safe rejection preserved |

Original test log: `R19_BOTH_EXACT_SOURCE_REGRESSIONS.json` SHA-256 `6a8c3d029db7b009a6deb5026136d21e40108f4d036afb9c649a5809e44e729e`.

**Scope:** these isolated scripts are evidence/preflight utilities; no overall release bypass, deployment impact, user-data exposure, or live exploit has been demonstrated. The known R17 empty-manifest issue concerned separate saved historical Python inspection tools; R19 is a new direct **exact-source Spatial JavaScript** reproduction.

## Owner-review-only fix, final revision

Proposed two-script patch at `docs/estate/proposals/R19_REVIEW_ONLY_SPATIAL_ASSET_RELEASE_STATE_GUARDS.patch`:

- Require a nonempty `manifest.assets` array before reporting `ok:true`.
- Reject manifest release states other than `pending-final-review` or `production-ready`.
- Reject both directionally inconsistent manifest/receipt production-ready claims.
- Retain the original `candidateOnly: results.length === manifest.assets.length` syntax expected by existing source-contract tests, with an additional `manifest.assets.length > 0` guard.
- Deliberately do not mark any asset production-ready, waive compression or change governed promotion authority.

Final patch Git blob `a5da3f2c393f439469712388a75e5d68b7e722d6`, **3,647 bytes**, SHA-256 `3a0ed1804322d6fcbff5ff22e66ae99c0c272971312442f70597a1e519a40836`. GitHub readback matched the exact blob. Local `git apply --check`, actual `git apply`, resulting-byte `cmp` against both candidate files, and `node --check` for both passed. The implementation remains a **review proposal in Factory audit docs**, not applied to Spatial.

**Patched fixture results: 18/18 expected script executions reproduced** (9 cases × 2 scripts). Empty manifest, both conflicting state directions, missing asset, incorrect SHA, unsupported manifest state and candidate-compression contradictions all exit nonzero; a valid pending candidate and matched production-ready state pair still exit 0 at these **scoped structure/receipt checks**. The latter does **not** mean full launch certification: governed approval and true media validation remain separate.

Patched log `R19_PATCHED_BOTH_GATES_REGRESSIONS.json` SHA-256 `00f4708d43a3b0819ce492cb6486775dafe1b4ef94cbf310632ac9a196a11d5f`. Local script revisions and SHA-256 are in `R19_PATCH_RECEIPT.json`. Existing `urai-tier1/tests/launch-critical-candidate-state-contract.test.mjs` source blob `606cc268c79230b387bba5cf5822ef600fa2b445` expects the original `candidateOnly` expression; this patch preserved that textual contract. A complete native repo suite and live Actions execution were **not** run.

## Existing GLB custody and live limits

R18 independently revalidated actual bytes/SHA-256 for **nine small Spatial GLB paths** (eight distinct binaries) against frozen R3 crosswalk. The **eight larger remaining current Spatial GLB paths** (seven MakeHuman V4 and current Home Entry) remain raw-inaccessible in this environment. This R19 run attempted the larger current Home file again: GitHub blob endpoint disallowed non-UTF8 binary and container direct Git clone DNS failed, so no raw-read or decode claim. Earlier R5's 26 private saved GLBs are a separate, overlapping historical custody set, not proof of these eight current Git blobs.

Live exact-head CI, original runtime/video/GLB codec checks, true compressed geometry decode, visual/AAA+++ owner acceptance, rights/likeness, accessible devices/XR, Privacy→Studio→Jobs→Replay→deletion, protected independent signoff, rollback and production admission remain unverified. Separate current-model `ready` runtime selection in Spatial is not a release approval. All requirements stay **HOLD**.

## Next Chalk worker

1. Obtain an approved binary-capable checkout of the eight large current Spatial GLBs and validate SHA-256, glTF scene/skin/animation/codec semantics with official tooling.
2. Source-owner review the R19 patch alongside existing R9/R11/R13 promotion/codec/type proposals; install only through reviewable Spatial owner integration, with protection and exact-head full CI.
3. Add actual native tests for empty assets, state mismatches, unsupported state, legitimate candidate and approved states, exact hash/receipt and corruption, and preserved governed decision pipeline behavior.
4. Resolve seven noncompressed core models, misleading Meshopt receipt claims, the active Home model, V4 Council fallbacks, and real browser/physical-device render. Do not treat successful source/fixture checks as visual authority.
5. Complete provider rights, isolated paid-leaf authority and protected consent/deletion/Replay acceptance, then independent release decision. No automatic merge or deploy.

**Disposition:** R19 discovered and reproduced two source-level verification gaps in two exact checked scripts, prepared and tested a non-promoting hardening proposal, and preserved all prior R1–R18 evidence without changing release authority. ONE URAI GENESIS remains **HOLD**.
