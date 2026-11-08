# R8 — Exact-source promotion and AAA governance synthetic gate reconciliation

**Observed 2026-11-07, America/Chicago.** Production **HOLD**. This is additive, read-only source audit evidence on Asset Factory draft PR #496, not a patch to Spatial, the existing Factory owner PR #421, a provider, or production.

**Pinned refs:** Spatial main `da94837c2457b0a7590e26a7a644cd728de8afb8`; Asset Factory audit before R8 `2b86cf4b559c1adcf125854df5275672c22c6cbd`; Factory owner PR #421 `e7d23952bcaa21209ff2d964c81c533f905863ca`.

## 1. Tested the actual original scripts, not merely policy text

Recovered **exact** `scripts/verify-governed-asset-promotion.mjs` (8,403 bytes, Git blob SHA-1 `5d818de78f4ea3f2c7dc77e42dca9c505de2e73b`) and **exact** `scripts/verify-aaa-asset-governance.mjs` (7,738 bytes, Git blob SHA-1 `d7c9dc38d5674b2df76f5dc36e472ce7020e24ef`) from pinned Spatial main. Independently reproduced their `git hash-object` values. Ran Node v22.16.0 in fresh local temporary directories for each of eleven synthetic cases, with no real/private production media and no cloud calls. Synthetic control had a valid minimal embedded geometry GLB v2 (one triangle). Read-only test harness captures each original CLI's RED/GREEN response and their conjunction.

[Complete 11-case machine matrix](manifests/R8_EXACT_SOURCE_PROMOTION_AAA_GATE_SYNTHETIC_MATRIX_20261107.json) records the exact source blobs, the expected outcomes and the test boundary.

| Deliberately synthetic condition | Original promotion CLI | Original AAA governance CLI | Both must pass |
| --- | --- | --- | --- |
| Minimal GLB with consistent approved receipt | GREEN | GREEN | GREEN |
| Malformed JSON production receipt | **GREEN** | RED | RED |
| Receipt has wrong binary SHA/bytes/status | **GREEN** | RED | RED |
| Receipt path instead points at an unrelated existing manifest | **GREEN** | RED | RED |
| Receipt file does not exist | RED | RED | RED |
| Promotion decision SHA-256 wrong versus actual asset bytes | RED | GREEN | RED |
| Promotion decision byte count wrong versus actual asset | RED | GREEN | RED |
| Reviewer and producer identities identical strings | RED | GREEN | RED |
| Asset manifest pending review, promotion requested | RED | GREEN | RED |
| Visual proof flag false | RED | RED | RED |
| Arbitrary text renamed `.glb`, hashes/metadata self-consistent | **GREEN** | **GREEN** | **GREEN** |

**Result: 11/11 predicted outcomes reproduced; together 9 RED and 2 GREEN. One GREEN is the intentionally correct control; the other is an invalid model-format test case.** This is not a real promotion bypass or proof of live deployment. It proves that *these two scripts alone* do not validate GLB format/geometry and the standalone promoter does not parse receipt contents.

The original promoter **does** verify candidate file exists, is regular, length/hash match, producer/reviewer fields differ, launch manifest state is production-ready, exact-check and visual/fallback/rights declaration flags are true. These safeguards genuinely reject corresponding synthetic cases. The AAA verifier **does** parse production receipt and match path/hash/bytes/state against the decision and checks other source ledger, haptics, audio and static fallback constraints. The two scripts have complementary validation.

## 2. Workflow integration and limits

- `.github/workflows/governed-asset-promotion.yml` (Git blob `5e983e7ef216da4e3ebf139bf53bd29abbc5ae4d`) runs original standalone verifier against changed decisions and checks the frozen clean head. It does not itself perform full binary-format validation.
- `.github/workflows/aaa-asset-governance.yml` (Git blob `312421f152e1fef0de354c946e96e4b8c4598275`) separately runs AAA verifier on pull requests touching `operations/assets/**` and specified generated asset subsets; it is not a verified branch-protection rule.
- `.github/workflows/launch-critical-asset-forge.yml` (Git blob `2981ef949d304996cb4cd6d08399842c7eb054c9`) has additional promotion/asset checks and candidate/replace paths, including Khronos-compatible validation in *candidate and replacement* paths. The promotion path's checks do not justify assuming the same official format check ran for every asset in every promotion.
- `scripts/audit-launch-critical-artifact.mjs` (Git blob `eeb8d633d6989a61e423c62b94f59d021bf43e8b`) does implement additional GLB inspection, but a script existing in source is not proof it is invoked, successful and required for every production promotion.

**Critical evidence boundary:** The simulated `both must pass` result is a logical conjunction of *local exact-script runs*, not a true full CI workflow. We did not inspect actual branch protection enforcement, live CI status, a production deployment, or successful artifact promotion. An invalid GLB's acceptance by these two scripts does not mean the full repository would deploy it.

## 3. Local noncommitted hardening proof

Created a scratch-only prototype extending the standalone promoter's receipt-path branch to **parse** the production receipt and enforce `fixedPath`, SHA-256, byte count and `production-ready` state. Locally tested the same eleven cases using the modified script; receipt-related false GREEN results changed to RED, while a valid minimal GLB remained GREEN. Prototype `git hash-object` = `e29bcb81c2afb0e2799c3c9ec53b6fdb2a431f82`. No executable code or binaries were committed to Spatial or Factory, only this report and sanitized test summary. Prototype is not a complete security fix: the arbitrary-bytes-as-GLB case still passes until a format validator runs as a required gate.

## 4. Next exact owner implementation and acceptance

1. In the Spatial owner lane, have the **standalone promoter fail closed on malformed/mismatched receipts**, verify receipt path is rooted in the expected production-receipt namespace and bind the approved receipt to the exact promoted bytes. Preserve existing independent approval and historical evidence.
2. Require official GLB format/geometry validation and stated compression/LOD budgets for **all promoted models** on every promotion path; do not rely on declared filename, MIME type, `compressionStatus` string, or checksum alone.
3. Require the entire release suite as a **protected check** with a source-pinned clean checkout and verified CI pass. Verify branch protection/rulesets, rather than assuming YAML existence guarantees enforcement.
4. Add original-source negative tests for mismatched/invalid production receipt, wrong current hash, missing/invalid GLB, stale prior authorization and review-state conflict. Verify existing real Home promotion evidence does not mistakenly greenlight the newer candidate.
5. Recover eight still-unread raw Spatial GLB binaries via an authorized binary-capable connector. The container's GitHub DNS remains unavailable and the GitHub connector rejects >1MB raw binaries; this is **access limitation, not asset absence**.
6. Keep R3–R7 custody/compression and original-source tests unchanged. No asset regeneration or paid compute is needed to repair these governance issues.

**No source patches, production mutations, paid model jobs, protected credentials, deployments or merge performed. Release HOLD.**
