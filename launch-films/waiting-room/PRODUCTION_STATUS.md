# Waiting Room Video Factory Status

## Current state

- Launch canon: defined in URAI Marketing draft PR.
- Anchor-film production manifest: created.
- Video production contract: created.
- Canonical Asset Factory `video` modality: implemented on draft PR #184.
- Deterministic `.animatic` proof renderer: implemented with stable shot timelines and explicit `productionReady: false` state.
- Video artifact serving: implemented for `.animatic`, `.mp4`, `.webm`, and `.mov`.
- Paid video provider seam: implemented for explicitly configured Replicate or Fal models; no paid call has been executed.
- Provider safety: HTTPS-only artifacts, private/local-host refusal, timeout and byte ceilings, supported-video validation, and mandatory human review markers implemented.
- Video policy: 90-second maximum, 4K maximum, estimated-unit/cost reservation, and format boundaries implemented.
- Provider transaction safety: required idempotency keys, normalized request hashes, atomic reservation, per-job/campaign ceilings, one dispatch lease, bounded attempts, and reservation-held failures implemented.
- Behavioral provider tests: implemented for valid MP4 retrieval, missing-model refusal, private URL refusal, and image-as-video refusal.
- Behavioral transaction tests: implemented for replay, conflict, per-job/campaign ceilings, duplicate dispatch refusal, artifact-review state, and failure reservation hold.
- Local multimodal E2E: video case added to generate -> materialize -> fetch -> publish -> approve.
- Deterministic package builder: implemented for timeline, SRT, WebVTT, audio-description cues, crop plans, cutdowns, claim/evidence bindings, and immutable hashes.
- Duplicate-safe package CLI: implemented with output confinement, atomic writes, and overwrite refusal by default.
- Day 0 source package: implemented as a 70-second, nine-shot animatic with captions, audio description, reduced-motion requirements, and shot-level evidence classes.
- Deterministic technical preview encoder: implemented with FFmpeg/FFprobe verification, H.264 video, AAC silence track, burned captions, output hash, and immutable technical-preview receipt.
- Exact-head workflow upload: implemented to retain the Day 0 package, encoded MP4 preview, build logs, CI roll-up, and receipts for 365 days.
- Workflow queue hardening: duplicate push/PR checks removed for feature branches; required workflows now use exact-head checkout, clean-tree proof, superseded-run cancellation, and SHA-bound artifact names.
- Final provider-generated cinematic shots: not generated.
- Final public films: not generated.

## Exact current branch posture

The implementation remains on draft PR #184. The final exact head must pass every registered workflow, and retained artifacts must be independently inspected, before this status can advance beyond implementation-candidate.

The encoded MP4 is a technical compositor proof with a controlled background, burned captions, and silent audio. It proves the package/encoder/receipt boundary; it is not AAA+++ footage and must never be promoted as the public Day 0 film.

Queued workflows count as zero passes. No paid provider call, provider spend, deployment, merge, secret mutation, billing action, production-data mutation, or public-film promotion has occurred.

## Remaining engineering and release sequence

1. Complete exact-head CI and inspect every failure, job log, package, MP4 preview, and roll-up receipt.
2. Independently review provider URL, timeout, byte-limit, model-selection, billing, idempotency, reservation, and dispatch boundaries.
3. Implement and review operator reconciliation and reservation-release authority so settled, refunded, rejected, and cancelled provider work cannot leave ambiguous budget state.
4. Reconcile Day 0 shot-level claims with exact deployed-SHA product evidence.
5. Lock the Day 0 visual continuity bible, characters, wardrobe, orb, environments, lens language, music/voice rights, and negative prompts.
6. Approve an explicit Day 0 provider/model and maximum spend ceiling.
7. Execute bounded shot-generation jobs, preserving every provider response, rejection, retry, cost, and content hash.
8. Assemble approved shots with real score, voice, sound design, captions, audio description, and reduced-motion variants.
9. Perform creative, continuity, rights, privacy, accessibility, device, and claim-evidence review.
10. Retain the final master, accessible variants, provider receipts, hashes, approvals, and rejection history.
11. Only then scale generation to the remaining anchor films and fourteen-day launch package.

## Release rule

Do not describe the system as autonomously generating final AAA+++ launch movies until the paid provider path, final-shot generation, compositor quality gates, evidence receipts, and one end-to-end anchor film are verified.
