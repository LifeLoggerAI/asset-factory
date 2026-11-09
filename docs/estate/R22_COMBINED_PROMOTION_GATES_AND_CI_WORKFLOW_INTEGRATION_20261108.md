# ONE URAI GENESIS — Asset Factory R22 combined release-gate and workflow reconciliation

**Observed:** 2026-11-08 America/Chicago / 2026-11-09 UTC. **Audit-only**, draft Factory PR #497 stacked on forensic #496. No Spatial application code, production, CI workflow, IAM, paid provider, user media, deployment, or merge was modified. **Release HOLD.**

## Immutable source anchors

- `LifeLoggerAI/urai-spatial` main `da94837c2457b0a7590e26a7a644cd728de8afb8` unchanged at R22 verification.
- Launch verifier original Git blob `11dc453dfab617fb9396232a38b638befa646c1c`.
- Independent artifact auditor original Git blob `eeb8d633d6989a61e423c62b94f59d021bf43e8b`.
- Governed promotion verifier original Git blob `5d818de78f4ea3f2c7dc77e42dca9c505de2e73b`.
- Governed promotion workflow original Git blob `5e983e7ef216da4e3ebf139bf53bd29abbc5ae4d`.
- The original three script bytes and workflow bytes were reproduced locally and verified against these exact Git blob hashes before testing.

## R19 + R21 exact patch combination

Applied both *review-only* proposals to exact originals in an isolated directory:
- R19 two-script fail-closed release-state guard patch SHA-256 `3a0ed1804322d6fcbff5ff22e66ae99c0c272971312442f70597a1e519a40836`.
- R21 governed-receipt content validation patch SHA-256 `ce2ca3a5bd2b008ddfcdb56d3e68b3a82e37f4f98536c5ce19be8b41d8cd4f99`.

Both `git apply --check` and application succeeded without conflicts; Node syntax checks PASS. Produced exactly the previously reviewed patched Git blobs: `23c9f1223f283c0a95bb4aebe1ce9875560028bc`, `e7eece3a330c8848a91e765c28c0f64b6dfe01a5`, `56073091d743e35926d47421c457333a09ec8445`. No release tree was changed.

### Fresh joint source-level test matrix

Ran **48 individual script executions** across 16 combinations (eight synthetic scenarios × unpatched and combined-patched source × three independent scripts). All 16 sets returned predicted pass/fail matrices. Cases included valid candidate, synthetic complete approval, malformed GLB, GLB declaring compression without real codec content, inconsistent generated receipt, wrong generated SHA, invalid production receipt, empty manifest. Test report: `reports/R22_THREE_VERIFIER_MATRIX.json`, SHA-256 `632aa44959ae75f86d61a929a5d1b12ebccd577e17ac38c6da9b74ffd74cbd57`.

**Important interpretation:** each script's success is a narrow check, not launch authorization. A synthetic invalid GLB can produce GREEN from the *launch verifier* and *governed verifier* even with R19+R21 applied; the independent artifact audit returns RED. An artificial GLB that merely names Meshopt without actual compressed geometry can produce GREEN from all three source-check scripts. An official Khronos-compatible GLB validator/codec decoder is a separate required gate; we did **not** run one on actual production source objects.

Compatibility reruns: original R19 patched fixture **18/18 expected outcomes**, receipt R21 patched **25/25 expected outcomes**.

## New R22 governed CI workflow wiring

Original `.github/workflows/governed-asset-promotion.yml` validates each changed promotion decision with the governed verifier, checks changed binaries against decision paths, and validates a selected decision on manual dispatch. It does not itself call both full manifest/receipt verifiers or independently validate the targeted GLB. The separate `launch-critical-asset-forge.yml` uses broader validation on other paths, plus a Home-specific contract on promotion. This is a **check-composition/coverage gap**, **not proof of an actual protected-branch bypass or unapproved deployment**.

Review-only workflow patch `docs/estate/proposals/R22_REVIEW_ONLY_CROSS_GATE_PROMOTION_WORKFLOW.patch`: **2,722 bytes**, SHA-256 `e89b9ddca27b7b1bc38bdca9af25d8014f59e90a1e5dd15a7f4f0c6b3e45a228`, Git blob `c0c3c4288076408f5bc2c866615d2700d1f3493e`. Derived from immutable original workflow Git blob `5e983e7e...`; proposed workflow Git blob `b3c943b5bb265da83d2918d4144e378c154c86cc`.

The proposal adds both source verifier scripts to PR path triggers; when a decision's `mode` is promotion, **after** its governed check it runs launch verifier, independent artifact auditor, then `npx --yes @gltf-transform/cli@4.2.1 validate` on a `.glb`/`.gltf` canonical path. Both pull_request changed-decision and workflow_dispatch paths receive the check. Rehearsals remain nonpromoting.

Exact patch `git apply --check`, byte parity against proposed workflow and PyYAML structure parse all PASS. **The npx validator is not pinned by a vendored binary/digest; owner must confirm package lock/provenance/offline reproducibility before integration.**

### Fresh isolated workflow execution tests

Extracted and executed actual workflow PR/dispatch shell steps inside **synthetic local Git repositories** with exact source scripts. A local `npx` stub safely simulated the official validator's success/failure and recorded whether invocation occurred; no package download or paid action took place.

**16/16 expected workflow outcomes**:
- Proposed PR and dispatch paths allowed valid synthetic candidate rehearsal and internally consistent synthetic promotion;
- Proposed paths rejected malformed binary, inconsistent generated receipt, wrong generated SHA and invalid production receipt;
- When the synthetic GLB passed structural checks but still required genuine independent validation, the stub returned exit 23, and the proposed PR/dispatch workflows propagated exit 23 and recorded exactly one invocation;
- Original workflow PR/dispatch accepted a malformed synthetic GLB and original PR accepted an invalid production receipt because they relied on the governed verifier alone.

Evidence: `reports/R22_WORKFLOW_PR_DISPATCH_TESTS.json`, SHA-256 `49c58b45ef83c8a33b64939f7ea5cabed6ad41ba4460f6eab278c25af7382d12`. These are shell-step simulations, **not actual GitHub hosted Actions or real glTF decode**. Full workflow runner execution, repository branch protection and active production deployment remain unverified.

## Independent governance boundaries and open defects

- The 26 current launch-critical manifest entries remain `pending-final-review`; candidate assets may not ship. All 26 generated receipts had been confirmed as candidate state in R19.
- Historical Home promotion documents reference **184,160-byte** prior GLB, whereas current Home tracked GLB is **1,786,808 bytes** with candidate receipt and pending final review. No historical visual authorization carries forward automatically.
- Current Seven MakeHuman V4 Git object identities remained unchanged from October to November (R20), but R22 did not decode their large current raw blobs.
- Synthetic decision `producer != reviewer` strings and JSON approval booleans do not authenticate identities or independent approval. Owner must pin reviewer authority to protected GitHub reviews and evidence to exact SHA; the proposed workflow does not solve this alone.
- The proposal is a minimal **review-only** integration improvement: it does not validate the entire cross-service privacy lifecycle, rendering, devices/XR, license/likeness, actual paid provider custody, true glTF compression, or final Home visuals. It does not substitute for other R9/R11/R13 fixes.
- Workflow `npx --yes` could attempt an external package fetch if run on GitHub: no such command was executed here. Production patch installation must make dependency and CI authorization explicit.

## Handoff

Next owner/worker: reconcile R19, R21 and R22 with existing Spatial verification logic and other promotion work; perform native repo tests and actual exact-head GitHub Actions after owner review; enforce independent approval, lock validator provenance, and certify current GLB binaries/visuals. Preserve all historical assets and receipts as dated evidence, not current authorization. Do not automatically merge or deploy. **ONE URAI GENESIS PRODUCTION HOLD.**
