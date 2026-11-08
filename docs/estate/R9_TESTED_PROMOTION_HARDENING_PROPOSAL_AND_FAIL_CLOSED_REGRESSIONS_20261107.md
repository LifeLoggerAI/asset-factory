# R9 — Tested fail-closed promotion preflight proposal, no source deployment

**Observed November 7, 2026 (Central).** Production **HOLD**. This is a continuation of Asset Factory R1–R8 on **draft PR #496**. No other worker's branch, the Spatial main branch, model bytes, cloud accounts, provider spend, approvals, or production deployment was changed.

**Pinned exact original**: Spatial main `da94837c2457b0a7590e26a7a644cd728de8afb8`; `scripts/verify-governed-asset-promotion.mjs` blob `5d818de78f4ea3f2c7dc77e42dca9c505de2e73b`, 8,403 bytes; Factory owner PR #421 at `e7d23952bcaa21209ff2d964c81c533f905863ca`. Prior audit checkpoint `08f88cd94aaf3f825aa5bd56667f93acebe44062`.

## Result — exact-original source patch applies and passes bounded checks

A proposed, **unmerged and unapproved** patch was constructed against the exact original script with these safeguards:

1. Require the current decision's production receipt to be at the canonical asset-specific receipt path, not an arbitrary existing JSON file.
2. Refuse missing, malformed, symlink or mismatched production receipts; compare receipt asset ID, fixed path, SHA-256, byte count and production-ready status.
3. For actual model promotion, reject obviously malformed, truncated, wrong-version or external-dependent GLB containers; require embedded buffer/view/accessor and triangle geometry.
4. Refuse unsupported required glTF extension names, and for assets declaring `draco-or-meshopt` require corresponding compression extension metadata on geometry rather than merely a receipt string.
5. Preserve non-promotion rehearsal and alias rehearsals and non-model asset behavior in the tested fixtures.

**Build proof:** Original and proposed full scripts both independently Git-hashed locally; original `5d818de78f4ea3f2c7dc77e42dca9c505de2e73b` and proposed `386049b5f587bcbcb1a52d09046381138209207c`. The standalone 8,940-byte unified diff applies cleanly using `git apply --check`, `git apply`, and byte-for-byte matches the tested proposed script afterward. `node --check` passes. Patch SHA-256: `4367ae5780f71b46ca525c91fef9942512937cf86f3c3faa8e81fca4bb2a17f9`; patch Git blob SHA-1: `5f18ed27733873a11d6a6553b46f6d3c3bf15888`.

**Exact patch handling:** The tested patch resides at `/mnt/data/urai_r9_proposal/patches/R9_proposed_receipt_and_glb_release_preflight.patch` in the active working container. A connector-created candidate patch blob had a *different* byte hash; the audit therefore **refused to commit that candidate** as though it were the locally tested patch. The GitHub audit branch contains this report and the machine summary only; its executable source and patch contents remain unchanged. Do not claim there is a GitHub-hosted patch without a matching hash.

## Native offline regression outcome

Executed 34 synthetic, isolated Node v22.16.0 test scenarios (each using fresh temporary fixture roots), with exact original Spatial and proposed script compared side by side:

| Metric | Result |
| --- | ---: |
| Regression scenarios producing expected behavior | **34/34** |
| Original standalone promoter returning GREEN | 28 |
| Proposed standalone promoter returning GREEN | 5 |
| Proposed standalone promoter returning RED | 29 |
| Original GREEN converted to proposed RED | **23** |
| Original rehearsal control remains allowed | PASS |
| Original alias rehearsal control remains allowed | PASS |
| Non-model asset control remains allowed | PASS |
| Privately retained saved GLBs checked against proposed gate | **26/26 PASS** |

Representative adversarial cases rejected in the proposal: malformed receipt JSON, wrong asset/receipt identity or hash, arbitrary receipt path and symlink, non-GLB arbitrary bytes, malformed GLB magic/version/length/chunks, external image/geometry references, unsupported required extensions, missing compression extension metadata, stale decision SHA, pending review, and missing visual approval declarations. These are **synthetic tests**, not live bypasses or an authorization to promote any model.

## Explicit limitations and owner review

**Not a complete glTF validator.** A deliberately fabricated Meshopt extension marker passed the bounded proposed preflight, even though its compressed payload was not decoded. This is an expected incomplete-coverage example: require a full official Khronos validation and **real extension decoder** over every production promotion. The patch should not be merged by itself as final acceptance.

The proposal also needs owner compatibility review for known compression formats, sparse or multibuffer glTF shapes, and historically accepted receipt schemas. Source-level test success does **not** authenticate human signoff, identity, license, visual rights, or actual devices.

This report does not change the R3–R8 facts: 26 saved assets retained and structurally verified, seven final-model compression receipts inconsistent with decoded metadata, current Home promotion receipt refers to older bytes, and eight larger Spatial tracked GLBs still lack direct raw-byte access. Model creation or paid GPU is not required to fix the software governance defects.

## Next exact work

1. Spatial owner reviews this **proposal**, reuses preexisting GLB parser and artifact audit where appropriate, and makes one reviewed implementation in the correct owner branch.
2. Complete official binary validators / decompression, receipt provenance/authority verification, and exact-current-asset identity proof in *required* promotion CI with source-pinned, clean runner.
3. Run the original source-level governance suite, negative cases and complete exact-head builds; verify branch-protection required checks before any promotion.
4. Recover the remaining eight big GLBs through an authorized, byte-capable read-only route. Validate Council/Home against real WebGL/mobile/XR and verify Privacy–Jobs–Studio–Replay media admission/deletion.
5. Keep owner PR #421 and Foundation/Labs governance unaffected; preserve old receipts as history, not current approval.

**No executive source patch deployed, PR merge performed or production authorization granted. Genesis remains HOLD.**
