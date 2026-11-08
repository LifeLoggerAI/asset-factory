# R12 — Exact R11 workflow patch recovered; real validator source semantics verified

**Observed:** November 7, 2026, Central. **Production HOLD.** Read-only source examination and additive audit documentation on [Asset Factory PR #496](https://github.com/LifeLoggerAI/asset-factory/pull/496). No Spatial source changes, owner PR #421 changes, production deployment, provider generation, or paid compute.

## Frozen source

- Spatial main: `da94837c2457b0a7590e26a7a644cd728de8afb8`
- Asset Factory owner PR #421: `e7d23952bcaa21209ff2d964c81c533f905863ca`
- R11 audit PR head before R12: `4522f553637dab34ce8a6df43340d40e33c38473`
- Original Spatial `.github/workflows/governed-asset-promotion.yml` Git blob SHA-1: `5e983e7ef216da4e3ebf139bf53bd29abbc5ae4d`

## 1. Recovered and published byte-exact R11 proposal

Original R11 created an owner-review workflow patch but did not publish it to GitHub because connector text transfer appeared to differ from the local tested artifact. Reading the attached file through the file service omitted only a **terminal newline**. Readding that exact newline reproduces the local verified Git blob SHA-1 `eeb8d5cc1d27a20fc70bbf3e5e5a66fb087f9040`, 3,940 bytes, SHA-256 `658292c512f45e51800603d9028d7128c6ab3e45c486a574d05ae3cc527d159f`.

The patch is now available at [R11 owner-review workflow patch](proposals/R11_PROPOSED_OFFICIAL_GLTF_PROMOTION_VALIDATION.patch), **as documentation-only proposal**. No executable Spatial workflow has been edited. The proposed resulting workflow Git blob SHA-1 is `0e1b392c77c17b7114c106386bfa9cfbebd58dc0` (7,591 bytes), retained locally.

Offline shell regression harness rerun: **15/15 expected synthetic outcomes reproduced** using mock `npx` and isolated local Git fixture repositories. This re-verifies control-flow behavior only, not the real external validator.

## 2. Actual upstream glTF Transform 4.2.1 source read

Fetched the exact `v4.2.1` tag from `donmccurdy/glTF-Transform`, not an unpinned latest source. Exact source Git blob hashes:

| Upstream file | Git blob SHA-1 |
| --- | --- |
| `packages/cli/src/validate.ts` | `b22eae5da0dc6dbbfdf6c4f59599ebc4747e7f0f` |
| `packages/cli/src/session.ts` | `eae5e77738da8bef0c188e6b9f4e90947ffb3fab` |
| `packages/cli/src/config.ts` | `0c29e1faf2ef9af34dd4afcd0eff9a7d964bf91a` |
| `packages/cli/package.json` | `fef0aac6147d362ab6f0019e825f6fb75524a06e` |

The `validate` implementation calls `gltf-validator.validateBytes`, prints categorized severity issues, and throws if any result has severity **0** (errors). Warnings at other severity levels do not, by that code alone, necessarily cause a nonzero exit.

The `Session.transform` implementation reads the input GLB via `NodeIO`, disposes existing Draco/Meshopt compression extensions after decoding to avoid lossy recompression, and writes the resulting document; default CLI config registers Draco decoder, Meshopt decoder and encoders. This supports the **design** of a `validate → copy → validate` promotion sequence, but does not establish its actual behavior on UrAi files. A CLI copy success is not equivalent to WebGL, XR, semantic preservation, triangle optimization, visual approval or privacy-safe release.

## 3. Actual local tool availability — a hard verification boundary

Node **v22.16.0** is available. The actual `@gltf-transform/cli`, `gltf-validator`, and `meshoptimizer` packages are **not installed** in this working environment or available through the inspected offline npm cache. An npm registry probe returned `EAI_AGAIN` (name-resolution unavailable). No package was installed, no real CLI command was run, and no network-dependent `npx --yes` was attempted as part of the test harness. Therefore R12 **does not report a real glTF validator PASS**, and does not claim to have exercised authentic Meshopt/Draco decompression.

For production-grade CI, replace runtime on-demand package fetching with frozen dependencies and verified package integrity; check native CLI error and warning exit behavior on intentionally broken and known-good compressed specimens; verify the clean exact-head source and branch-protection required checks.

## 4. Owner implementation implications

R8 demonstrated that the standalone promotion and AAA scripts together accept a renamed text file when hashes/receipts agree. R9's byte-verified receipt/GLB preflight patch improves basic rejection but R10 found malformed accessor payloads and fake extension metadata it still accepts. The R11 workflow patch is additive and **must not be merged as a substitute** for end-to-end enforced release acceptance. Owner should unify the R9 integrity checks, real `validate/copy/validate` codec execution, required original governance CI, author approvals, licensing, current asset hash and production admission in the existing workflow—without creating an unreviewed competing authority layer.

Further gates remain: eight larger current Spatial GLBs raw-uninspected; seven final generated receipts claiming Meshopt when corresponding raw GLB metadata shows no such geometry compression; newer Home Entry candidate without current-binary promotion; Council V4 candidates and real device/visual/accessibility certification; Privacy–Jobs–Studio–Replay source/consent/render/deletion.

[Structured R12 register](manifests/R12_VERIFIED_R11_PATCH_AND_GLTF_TRANSFORM_UPSTREAM_CHECKS_20261107.json) records source revisions, original patch hashes, upstream dependency sources, test boundaries and outstanding gates.

**No production change, paid generation, owner PR mutation, or merge. Production HOLD.**
