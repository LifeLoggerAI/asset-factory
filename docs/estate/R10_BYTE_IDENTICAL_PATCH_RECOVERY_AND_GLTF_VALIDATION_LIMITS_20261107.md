# R10 — Byte-exact R9 patch preserved; glTF format validation limitations independently reproduced

**Observed 2026-11-07 Central.** Independent continuation on Asset Factory draft PR #496. No Spatial executable source, model, production system, provider, cost center, branch protection, owner PR, or release decision was changed. **GENESIS PRODUCTION HOLD.**

## Immutable source checkpoint

- Spatial main: `da94837c2457b0a7590e26a7a644cd728de8afb8`
- Factory owner PR #421: `e7d23952bcaa21209ff2d964c81c533f905863ca`
- R9 audit head: `1b730fff7160614fdee38b5f74ab8de8a7d96a8c`
- Promotion verifier current Spatial Git blob: `5d818de78f4ea3f2c7dc77e42dca9c505de2e73b`
- R9 proposed patched executable script SHA-1: `386049b5f587bcbcb1a52d09046381138209207c`

## 1. Recovered *exact* R9 tested proposal in GitHub

Previous R9 reported an inability to publish the locally tested unified diff through GitHub because the connector-bound text transfer appeared one newline short. In R10, reading the actual attached 8,940-byte patch through the file service revealed that textual extraction omitted the **terminal newline**. Readding precisely one newline reproduced the original **Git blob SHA-1 `5f18ed27733873a11d6a6553b46f6d3c3bf15888`**. The independent local patch file's SHA-256 was also rechecked at `4367ae5780f71b46ca525c91fef9942512937cf86f3c3faa8e81fca4bb2a17f9`.

The patch is now stored as an **audit proposal, not executable production source**, at [docs/estate/proposals/R9_PROPOSED_OWNER_PROMOTION_RECEIPT_GLB_PREFLIGHT.patch](proposals/R9_PROPOSED_OWNER_PROMOTION_RECEIPT_GLB_PREFLIGHT.patch). GitHub readback returned the exact expected Git blob SHA-1. This resolves the R9 publishing issue: **the proposed patch is reproducible for owner review, but is still neither applied nor production-approved**.

## 2. Re-ran existing R9 suite without changes

Exact local proposal against the independently pinned original gate, Node v22.16.0, synthetic temporary inputs only: **34/34 cases produced the expected response; 23 original GREEN results changed to proposal RED**. The original rehearsal, alias rehearsal and nonmodel controls remained passing. No private saved models were uploaded.

## 3. Additional R10 glTF negative probes

Eight *new* synthetic, read-only cases were run against the same original promoter, proposed promoter and AAA governance gates. The additional results are:

| Synthetic negative | Original gate | R9 proposal | AAA governance |
| --- | --- | --- | --- |
| POSITION accessor references undersized four-byte view | GREEN | GREEN | GREEN |
| POSITION uses non-FLOAT component without quantization | GREEN | GREEN | GREEN |
| Indexed triangle references FLOAT index accessor | GREEN | GREEN | GREEN |
| FLOAT accessor view is misaligned by one byte | GREEN | GREEN | GREEN |
| POSITION missing minimum/maximum bounds | GREEN | GREEN | GREEN |
| Index payload never decoded and bounds not proven | GREEN | GREEN | GREEN |
| Triangle accessor count exceeds declared budget | GREEN | **RED** | GREEN |
| Fake Meshopt extension metadata without real decompression | GREEN | GREEN | GREEN |

**Outcome: 8/8 predicted behaviors reproduced; 7 malformed or unproven models still pass the proposed gate.** These examples illustrate the precisely stated limitation of the R9 *bounded preflight*, not a newly claimed live exploit. In particular, the sixth scenario tests absence of decoded index validation; it does not independently construct out-of-range index values.

The full *original* Khronos glTF validator, a real Meshopt/Draco decoder, Blender/GPU render and canonical exact-head CI were **not run**; these executables were not available locally. Do not treat eight synthetic probes as comprehensive glTF validation.

[Machine-readable R10 register](manifests/R10_VERIFIED_R9_PATCH_AND_8_ADVERSARIAL_GLTF_NEGATIVES_20261107.json) records the test IDs, observed statuses, hash anchors and caveats; it deliberately contains no private media.

## 4. Owner implementation recommendation

Do **not** merge the R9 patch as the sole model production validator. It is a useful owner-review artifact for receipt/file integrity and early fail-closed checks, but **exact-source production promotions must also mandate official glTF validation and actual codec decoding with fail-closed exit codes**. Validate real accessor byte ranges, alignment, legal component types, index bounds, compression payload semantics, node/skin and texture relationships and triangle budgets. Reuse existing `scripts/audit-launch-critical-artifact.mjs` and governed-promotion workflows where possible rather than creating competing gates.

A passing receipt/path hash is **not** a substitute for verification that the bytes are valid deployable geometry, nor for provenance/license, human visual acceptance, protected memory deletion or cross-device testing.

## 5. Remaining release work

Eight Spatial GLBs still need authorized raw binary access and structural/skin/clip/codec verification: seven MakeHuman V4 candidates and the current Home Entry Chamber. Seven readable final GLBs have generated receipts claiming Meshopt, while their decoded glTF JSON has no actual corresponding compression extension usage. The current Home replacement cannot inherit the earlier 184,160-byte asset's production approval. The Council V4s remain previews, and canonical Home human presence is not independently proven.

Owner review → exact-source negative tests → required original CI/branch protection → visual/browser/mobile/XR and Privacy–Studio–Jobs–Replay integrity → independent release decision are still unresolved. **HOLD.**
