# R11 — Governed promotion format-validation workflow proposal and offline regression

**Observed:** November 7, 2026, America/Chicago. **Production HOLD.** This is incremental, non-promoting audit work on Asset Factory draft PR #496 only. No producer model, private media, Spatial executable source, owner branch, provider, production deployment, or paid tool was modified.

**Source checkpoint:** Spatial main `da94837c2457b0a7590e26a7a644cd728de8afb8`; existing `.github/workflows/governed-asset-promotion.yml` Git SHA-1 `5e983e7ef216da4e3ebf139bf53bd29abbc5ae4d` / 4,254 bytes; Asset Factory owner PR #421 `e7d23952bcaa21209ff2d964c81c533f905863ca`; prior audit head `9a60f866262455968e3f9b5929bc85491b3c1330`.

## 1. The existing workflow has a narrow missing gate

Spatial already has separate `aaa-asset-governance.yml`, `launch-critical-asset-forge.yml`, `governed-asset-promotion.yml`, `verify-governed-asset-promotion.mjs`, and `audit-launch-critical-artifact.mjs` code. Some *candidate generation and replacement* paths in `launch-critical-asset-forge.yml` run `@gltf-transform/cli@4.2.1 validate`. The separate governed **production-promotion** workflow verifies receipt metadata and manifest references but does **not** systematically validate the promoted GLB's glTF semantic content and compression payload with the same native tooling.

This is an interface/composition gap, **not an absence of all governance**. R8 exact-source synthetic tests already showed that an arbitrary text file named `.glb` can pass the standalone promoter and AAA gate when receipt and decision declarations agree. R9's proposed receipt-and-GLB preflight is valuable but R10 showed 7/8 malformed or unproven glTF cases still accepted by that bounded checker.

## 2. Created a separate owner-review workflow patch, not production code

Reconstructed the exact 4,254-byte governed promotion workflow and independently checked its Git object identity against Spatial main. Produced a **nonexecuted proposal** adding a conditional promotion-model validator that uses the existing `@gltf-transform/cli@4.2.1` commands to validate the original GLB, copy/decode into a fresh temporary GLB and validate that result. Handles pull-request changed decisions and manually selected `workflow_dispatch` decisions, preserves rehearsals and non-models, refuses missing/noncanonical GLB paths, stops on command error, cleans temporary files and checks that the frozen checkout remains clean.

Local proposal files, available as conversation artifacts:
- `/mnt/data/urai_r11_ci_hardening/proposals/R11_PROPOSED_OFFICIAL_GLTF_PROMOTION_VALIDATION.patch` — **3,940 bytes**, SHA-256 `658292c512f45e51800603d9028d7128c6ab3e45c486a574d05ae3cc527d159f`, Git blob `eeb8d5cc1d27a20fc70bbf3e5e5a66fb087f9040`.
- `/mnt/data/urai_r11_ci_hardening/proposals/R11_OWNER_PROPOSED_governed-asset-promotion.yml` — **7,591 bytes**, Git blob `0e1b392c77c17b7114c106386bfa9cfbebd58dc0`.

`git apply --check`, `git apply`, exact output-byte comparison, full YAML parse and `bash -n` all passed locally. This proposal was deliberately **not** committed as an executable workflow in Spatial or copied to its owner branch. The existing R9 patch remains a separate review artifact.

## 3. Offline shell execution tests: 15/15 behaved as expected

Parsed the proposed YAML and actually ran its extracted Bash step in fresh, fully isolated temporary Git repositories using a **mocked `npx` executable**, never fetching or installing the actual validator. The 15-case matrix covers manual promotion, PR promotion, unchanged PR decisions, rehearsals/nonmodels, unknown asset IDs, symlinked decisions, invalid canonical paths, missing binary, errors in original validate, errors in simulated copy/decode, and errors validating simulated output.

**15 cases / 15 expected outcomes / 0 test failures.** The successful synthetic promotion case calls the mock `validate → copy → validate` sequence exactly as designed. All three injected validation/decoding failures produce nonzero script exits. No real model bytes were passed through the proposed step. Detailed machine register: [R11 source and synthetic test manifest](manifests/R11_WORKFLOW_FORMAT_VALIDATION_PROPOSAL_AND_15_MOCKED_CASES_20261107.json).

**Evidence boundary:** These are actual Bash/shell-flow tests and YAML/source checks with a mocked external validator, **not** an official Khronos validator result, real Meshopt/Draco decode, live GitHub CI pass, model visual proof, or performance certificate.

## 4. Explicit concerns before any owner adoption

1. Verify the real `@gltf-transform/cli@4.2.1` `validate` and `copy` behavior and exit codes with known-good and malicious actual GLBs. A CLI `copy` alone must not be assumed to decode or validate *all* compression payloads or every GPU path. Require a real codec fixture and full official glTF validation.
2. Replace `npx --yes` on-demand fetching with the owner's **frozen/pinned dependency and digest** posture, and execute in locked CI. Container DNS was unavailable for actual package installation during R11; no `npx` network invocation occurred.
3. Have the Spatial owner integrate receipt/path/asset approval checks and model validation into one unavoidable, protected release acceptance route; verify branch protection/rulesets and exact commit identity rather than relying on workflow presence.
4. Include regression fixtures for arbitrary renamed bytes, invalid accessors, illegal indices, fabricated Meshopt metadata, stale Home approval and the seven final-model incorrect Meshopt receipt claims. Use official validator, real codec and postdecode geometry checks.
5. Authoritative/current Studio, Jobs, Privacy and Replay protected media source→consent→render→deletion acceptance, rights/likeness, Home/Council visual quality and physical mobile/XR checks remain outstanding.

## 5. Custody and release status

R5 verified all 26 historical saved models as raw bytes. Spatial main still has eight GLB paths not raw-readable through the current GitHub connector (seven MakeHuman V4 files and the current Home Entry Chamber). Existing provider-billing issues, lack of full CI runner proof and live device evidence remain unaffected. No models were generated, modified or promoted.

**R11 result:** bounded workflow hardening proposal and 15 offline shell tests are ready for independent owner review. **No production authorization granted; Genesis HOLD.**
