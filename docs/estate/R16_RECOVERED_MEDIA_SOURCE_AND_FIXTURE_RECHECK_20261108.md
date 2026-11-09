# R16 — Legacy custody follow-through, fresh local fixture tests and current GitHub reconciliation

**Observed:** 2026-11-08 Central / 2026-11-09 UTC. **Status: audit documentation only; production HOLD.** This report is additive to R1–R13 on forensic PR #496 and the separately recovered R14/R15 files in this branch. It does not establish that historical original media bytes were fetched, decoded, rights-cleared, deployed, or promoted.

## 1. Frozen source and ownership observations

- Factory main `a49f611ade29a1754787701ab4bf915c85c0cdc6` remains the default branch.
- Owner PR #421 head `e7d23952bcaa21209ff2d964c81c533f905863ca` is open, draft and unmerged.
- Security PR #493 head `3105353064d389373b9c792894c78e0e1171158a` is open, draft and unmerged.
- Integration PR #494 head `09fb062643cbad7cd0576fb85bb05d2db97d7d49` is open, draft and unmerged.
- Forensic PR #496 and the previously named R14/R16 audit branches **all pointed to** `21154eb50c312a1846bcf5b229fdc7ad1a3154a0` **before this R16 documentation write**, with R13 as the last published substantive round. A branch name is not a published R14/R15 audit.
- R14 and R15 original saved reports have now been published as additive audit documents **on the existing isolated R16 audit branch only**:
  - `docs/estate/R14_LEGACY_MEDIA_AND_CUSTODY_RECOVERED_20261108.md`
  - `docs/estate/R15_LEGACY_MANIFEST_SECURITY_AND_MEDIA_RECOVERED_20261108.md`
  Neither report is a fresh execution of all historical media validation.

## 2. Recovered source/custody facts

- Original UrAi `main 8cac3ba513830c11261d57bc2b5dd7ad8b83e85a`: R14/R15 record 35 .mp4 **paths**, including 28 nonempty regular Git blobs (317,151,186 declared bytes), four zero-byte files and three symlinks. Raw MP4 SHA-256, decoding, codec, frame quality, runtime use and launch-film rights remain **unverified** in this pass.
- Legacy UrAiProd `main d3d7ce6e607a5ee1be2c9f9ede6eecf1cfb393b9`: 56 .glb paths, 47 nonzero, nine zero; 73 model-manifest records, 72 distinct expected URLs, and no matching `public/models` tracked source paths in that frozen tree. Actual build/deployed URL coverage is unknown.
- Factory owner source contains 36 tracked image/glTF proof-media objects and **no tracked finished production GLBs** in its inventoried tree. Spatial and saved Drive evidence are separate custody sources; they must not be double-counted.
- Historical 26 saved GLBs/68,094,300 raw bytes and canonical 213 Spatial images are documented in prior audit rounds, but were **not re-hashed or visually accepted in this R16 execution**.
- The 278,133,223-byte Generic World v1.0.2 ZIP remains external/unaccessed; task/provider metadata cannot substitute for retained ZIP bytes.

## 3. Fresh exact-source checks against connected GitHub

- Main `model_forge/forge.mjs` Git blob `22146eb20a9199070ff95fe8c96f98f20ccbd46b` still uses `https://api.tripo3d.ai/v2/openapi/task`; owner draft Git blob `e01440825c739e937e2f2b48d2bd2168e3d7b467` uses `https://openapi.tripo3d.ai/v3/generation/`. Owner V3 migration is **not main or deployed-version proof**. Model labels such as V2.5 are separate from API endpoint version.
- Original UrAi `scripts/check-genesis-assets.mjs` blob `5eaf22988811b81dbfcb409ee9be98abd38d085a` explicitly sets `process.exitCode = 0` when any required assets are missing. This is a **false-success as a strict final asset gate**; preview behavior must be distinguished from release acceptance.
- Original UrAiProd `generate-manifest.mjs` blob `df8ffae49783bc210e62f237cf104d44b8e3ad78` uses `JSON.stringify(reg, None, 2)` in its TypeScript emitter, while JSON is written earlier. Previous R15 isolated fixture reproduced partial output before a `ReferenceError`. Its `None`→`null` local patch remains owner-review-only.
- The public UrAiProd repository has three tracked file metadata entries under `private-canon/life-reference/`, totalling 20,428 declared bytes. R15 raised a potential identifying-metadata review; this R16 verification enumerated **only directory/tree metadata**, not private contents. Privacy owner must assess intended public status and history-aware containment confidentially.

## 4. New reproducible local fixture execution

Recovered original saved R14/R15 Python tools and tests from prior ChatGPT Library artifacts, materialized to an isolated working directory, then re-executed against freshly created **synthetic local Git repositories**. No historical MP4/GLB media was fetched, no real private data accessed, and no paid provider call was made.

| Check | Actual R16 outcome | Local log SHA-256 | Scope |
| --- | --- | --- | --- |
| `python test_urai_asset_forensic_inspector.py` | **16/16 PASS** | `07e268bbccd4366baa4b5bf6c96a475da76a8ded4876a8029da62a5dc6b10cd0` | Source SHA/size, zero-byte, symlink, LFS pointer, minimal file headers and duplicate media in fixtures |
| `python test_r15_manifest_path_guard.py` | **16/16 PASS** | `db6e642d05854134d36c48b6d468326e0606b4b63b601e0120fd62f9f1e6a18e` | Strict nonzero on absent/misplaced/unsafe/zero/symlink/duplicate manifest paths in fixtures |

Tools use the original saved `/mnt/data/` script paths; for the rerun, temporary symlinks were created in that directory and removed after test completion. No source repo was modified. This verifies that the saved test harnesses execute successfully **today on fixtures**, not that their output validates full original Git media bytes.

Current workflow status inspection: Factory forensic head `21154eb5...` has original GitHub Actions run `42447140097` completed **failure**; owner `e7d239...` and composite `09fb06...` have failed workflow runs. These results do not establish the failure root cause. No protected current exact-head green, independent approval, provider credential custody, authenticated multi-tenant test or production acceptance was obtained.

## 5. R16 handoff and explicit release gates

1. Privately triage the possible public personal-reference metadata exposure with Privacy/security ownership before writing more public detail; inspect the content only under appropriate permissions and never reproduce identifying values in public audit receipts.
2. Acquire an authorized immutable checkout or binary-capable source route and execute the read-only inspector against the 28 original MP4s and 47 nonempty UrAiProd GLBs; record raw SHA-256 and sizes. Run actual `ffprobe`/decoder and official Khronos glTF validator on genuine bytes. No regeneration or private media publication.
3. Decide whether historical `/models/` manifest URLs are active and if so require a traced, hard-failing source-to-public packaging and geometry validator; keep optional old Genesis fallbacks from authorizing final production.
4. Inventory Meshy tasks/expiry using an authenticated read-only authorized provider interface, distinguishing three-day non-Enterprise task download windows, web plan access and the separately dated subscription renewal. Avoid paid jobs/downloads without authorization.
5. Verify actually deployed Tripo API version and provider/spend authority. Do not infer live upgrade from owner #421.
6. Preserve and reconcile the 26 historical saved GLBs, eight raw-uninspected current Spatial GLBs, current Home candidate, seven misleading Meshopt receipt assertions, 213 canonical WebPs and 36 noncanonical WebPs. Finish genuine codec/visual and device acceptance.
7. Submit owner-reviewed, compatible R9+R11+R13 promotion guards into the existing pipeline, then require original protected CI, independent review, exact-art SHA, rights, Privacy→Studio→Jobs→Replay→revocation/deletion and rollback proofs.
8. Do not merge owner/security/composite docs or ship assets merely because a historical checker exits zero, a synthetic unit suite passes, an archive is named, or a provider receipt exists.

**Conclusion:** Existing UrAi media and software are real and historically substantial. Their complete all-byte, provenance/rights, deployed runtime, physical-device, protected cross-service and final-art evidence is **not certified**. R16 publishes recovered audit narrative and scoped test receipts; **ONE URAI GENESIS production remains HOLD**.
