# URAI Full Multimodal Asset Completion Ledger

Verified against:

- `LifeLoggerAI/asset-factory` main SHA `db92abe76daa25a5a8f101758fcefd5729ae81e8`
- `LifeLoggerAI/urai-spatial` main SHA `4457b32eb80e70e583713cb1f73e0ff628b134a3`
- Spatial release candidate PR #515 head `e8f089700142233d8954006b73a674d5d87a0228`
- Protected deployment follow-up PR #517 head `57c06be70f14c6048be6a3516eb510793bb5d5f7`

No paid run, production merge, or deployment is authorized by this ledger.

| Lane | Total | Existing verified | Missing | Generated | Passed | Failed | Blocked | Cost used | Cost remaining | Promotion PR | Runtime verified |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| Visual | 213 canonical outputs in V1-V5 contract | 0 provider-certified outputs proven by visible receipt | 213 pending proof | 0 proven | 0 proven | 0 currently proven | 213 | $0 verified in this program | approval required for paid generation | none found | no |
| 3D | 12 launch-critical manifest entries, including 7 model/HDR assets plus materials/loading/audio candidates | 0 selected production binaries proven at sampled canonical paths | at least sampled canonical GLB/HDR paths absent | deterministic forge exists; outputs not proven promoted | 0 selected production assets certified | 0 proven | all pending review/proof | $0 | provider budget not yet prepared | none | no |
| Audio | 1 coarse production pack entry pending decomposition | runtime controller and ambient/voice hooks exist | production ambience, SFX, narration, mixes, transcripts, licenses and consent receipts | 0 | 0 | 0 | 1 | $0 | provider selection and bounded dispatch required | none | no |
| Film | 1 coarse production pack entry pending decomposition | Replay routes and film surface source exist | deterministic scene manifests, rendered exports, captions, audio description and export receipts | 0 | 0 | 0 | 1 | $0 | provider/render budget not yet prepared | none | no |
| Accessibility | 1 coarse cross-route pack pending decomposition | source includes reduced-motion and route accessibility work, not full multimodal certification | captions, transcripts, low-bandwidth, silent and static fallbacks require complete inventory and proof | 0 | 0 | 0 | 1 | $0 | $0 deterministic work first | none | no |
| Governance | 1 rights ledger pending decomposition | claim-boundary and privacy governance source exists | asset-specific rights, provider terms, music licensing, voice/likeness consent, retention and revocation records | 0 | 0 | 0 | 1 | $0 | $0 deterministic work first | none | no |
| Runtime | 1 exact-release proof chain | source routes and release-control workflows exist | exact deployed SHA, distinct rollback proof, live parity, screenshots and sealed multimodal receipt | 0 | 2 diagnostic checks passed on PR #515 | 0 | 1 | $0 | protected action required only after all assets certify | PR #515 and #517 remain draft | no |

## Corrected record

1. Dispatcher commits `77ba72bc5228250b2450518a1b96c40717687bf4` and `db92abe76daa25a5a8f101758fcefd5729ae81e8` exist. The first file was truncated; the second repaired the workflow.
2. No visible completed V2-V5 provider run, artifact receipt, promotion branch, or promotion PR was found through the connected evidence sources. Dispatch and completion remain unproven.
3. The commit named `Promote patched V1 forge output to Spatial` changed a workflow to support future promotion. It is not proof that a V1 promotion run or PR succeeded.
4. The Spatial asset authority lists selected GLB, HDR, material, loading, and audio paths as pending final review. Sampled canonical model/HDR files were not present on current main.
5. Procedural fallback geometry exists and is valid as fallback evidence; it is not a finished bespoke selected-asset receipt.
6. PR #515 is open, mergeable, and draft. Its exact head is `e8f089700142233d8954006b73a674d5d87a0228`; most required checks were still queued in the latest visible run listing.
7. PR #517 is open, mergeable, draft, and stacked on #515. It must be retargeted and reverified after #515 merges.
8. Repository launch truth marks exact deployed SHA and rollback SHA blocked. The live deployment identity is therefore unverified.
9. `/privacy-controls` live parity remains unverified and prior repository evidence says it served Home content.

## Release rule

The program is not complete while any manifest entry is `missing`, `candidate`, `generated`, `validated`, `failed`, or `blocked`. A certified item requires approved review, merged promotion, checksum, provenance, exact release SHA, and live route evidence.
