# R13 — Promotion asset-type coherence, actual CI failures and preserved guard proposal

**Observed November 7, 2026 Central. Production HOLD.** This is independent audit documentation on Asset Factory draft PR #496 only; no model generation, paid service, production source change, asset replacement, original owner-branch change, branch merge or deployment.

## Fixed revisions

- Spatial main `da94837c2457b0a7590e26a7a644cd728de8afb8`
- Factory owner PR #421 `e7d23952bcaa21209ff2d964c81c533f905863ca`
- Audit before R13 `ec97990f64108612a34cc916c343626372a5eb61`
- Original Spatial governed promoter blob `5d818de78f4ea3f2c7dc77e42dca9c505de2e73b`
- Original AAA governance blob `d7c9dc38d5674b2df76f5dc36e472ce7020e24ef`
- R9 proposed promoter blob `386049b5f587bcbcb1a52d09046381138209207c`
- R11 proposed workflow: exact-byte verified previous R12, Git proposal `eeb8d5cc1d27a20fc70bbf3e5e5a66fb087f9040`

[Machine-readable R13 audit manifest](manifests/R13_CI_ENFORCEMENT_AND_TYPE_COHERENCE_20261107.json) includes exact probes and observation bounds.

## 1. Confirmed additional synthetic fail-open type-selection route

Both the original production promotion verifier and AAA governance check JSON-declared asset type and state, but neither requires a `.glb` filename to have `kind:'model'`. R9's candidate GLB preflight and R11's proposed `validate → copy → validate` workflow likewise condition model parsing on `kind:'model'`.

Executed **four** isolated test fixtures against the exact original promotion/AAA source, R9's unchanged proposed verifier and R11's proposed Bash with mocked `npx`. One proper minimal GLB model and one malformed GLB model establish controls. Two synthetic `.glb` paths declaring `kind:'material-pack'` (one binary invalid, one minimally valid) all returned GREEN under both original gates and both proposals. Scratch-only one-line type guards in R9 and R11 returned RED for both misclassifications; the legitimate minimal model remained GREEN and the R9 proposal still rejected malformed model bytes. **4/4 fixture outcomes were reproduced as predicted.**

**Not a demonstrated real-world exploit.** The source launch register at `9e7030543fe7468a74edaecca5f3492405e3bae7` contains **26 assets** (22 models, one texture, one material-pack, one loading sequence, one audio) with **0** current GLB-vs-kind mismatches. This is a future-change defense-in-depth hardening case.

A byte-exact **1,700-byte** owner-review patch, [R13 type-coherence addendum](proposals/R13_AFTER_R9_AND_R11_TYPE_COHERENCE_HARDENING.patch), SHA-256 `ac0f565d2f92cc53a59dfb32dc6d315fc8dac90a00dfc5e7a15578fd78c7f503` / Git SHA-1 `8d15523ac538cad7e80174ccecfa41b40a880fd6`, was tested to apply cleanly with `git apply`, `node --check` and YAML parsing. **It applies on top of the R9/R11 *separate proposals*, not directly on Spatial main**. No executable production source was committed.

## 2. Real CI status is not green and failure reason is unproven

Read the GitHub Actions run/status APIs. The latest inspected Factory audit-head run `42446443906` (run head `ec97990f...`, workflow `URAI Production Verify`) has completed **failure**; job `128626262031` is also **failure**. An older Factory baseline readiness run `42339906710` at `a244e8f0...` has failed build/verification job `128305067133`, while deployment was skipped. A recent separate Spatial PR run `42434050473` at `df19b28...` is also failure, with job `128588960531` failed. **These are three separate source candidates**; do not misattribute the Spatial PR's failure to Spatial main.

All inspected jobs returned **zero visible steps** through the connector, and logs returned **404 BlobNotFound**. Consequently the current evidence does not establish that the failures were caused by billing, YAML, source tests, runners, missing permissions or model binaries. Do not invent a root cause or promote historical local PASS into Actions PASS.

Spatial main branch protection endpoint returned **403 Resource not accessible by integration**; accessible rulesets lists were empty. This **does not establish** the absence of effective branch protection or required checks, because administration access is unavailable. No protected merge/release eligibility has been verified.

## 3. Existing independent artifact-auditor should be reused

Actual Spatial `scripts/audit-launch-critical-artifact.mjs` (Git blob `eeb8d633d6989a61e423c62b94f59d021bf43e8b`) already checks whether GLB `extensionsUsed` contain Draco or Meshopt and emits an **error if a production-ready model** requires that compression but none is declared; pending assets get a warning. This is real source functionality. However, extension-name inspection does **not** prove the compressed payload is decodable or that GPU geometry renders. Keep that code and add official validation/decoder evidence in the existing governed promotion pipeline.

The real `@gltf-transform/cli`, Khronos validator, Meshopt/Draco decoders and Blender were not present in this container; npm cache had no matching packages and registry hostname was unresolved. R11/R12/R13 mock tests are not real codec tests. Avoid on-demand `npx --yes` in production; freeze the dependency and test a valid and invalid compressed GLB with the installed CLI.

## 4. Owner and next worker handoff

Owner should compose (not independently merge) R9's receipt/current-byte guard, R11's complete model validation gate and R13's type/extension coherence guard with existing promotion/AAA/launch artifact auditors, checking that every promotion path invokes them. Add negative tests for type misclassification, fake Meshopt, invalid accessor payload, stale Home receipt and wrong current SHA. Require actual frozen CI, verify protected required checks and actual validator/decompression. Only then proceed to device/accessibility and Privacy–Studio–Jobs–Replay integrated proof.

Persistent gaps remain: eight Spatial GLBs lack raw-byte inspection (seven V4 humans and current Home Entry); the older Home production approval is for different bytes; seven inspected final-model receipts claim Meshopt without compressed geometry; current V4 Council models remain preview-only; full design, license, rendering, protected-media and release acceptance is unverified.

**Evidence-only result: R13 no spending and no deployment. Genesis release HOLD.**
