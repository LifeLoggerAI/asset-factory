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
- Behavioral provider tests: implemented for valid MP4 retrieval, missing-model refusal, private URL refusal, and image-as-video refusal.
- Local multimodal E2E: video case added to generate -> materialize -> fetch -> publish -> approve.
- Video package/compositor and accessible export pipeline: not yet implemented.
- Retained exact-head workflow artifact proving a completed video E2E run: not yet available.
- Final public films: not generated.

## Exact current branch posture

The implementation remains on draft PR #184. The latest exact head must pass typecheck, unit/static tests, build, E2E, security review, and retained-artifact inspection before this status can advance beyond implementation-candidate.

Queued workflows count as zero passes. No provider spend, deployment, merge, secret mutation, billing action, or public-film promotion has occurred.

## Remaining engineering sequence

1. Complete exact-head CI and inspect failures or retained evidence.
2. Implement deterministic timeline/caption/audio-description/crop/cutdown package generation.
3. Bind approved shots, audio, claims, and evidence to immutable package receipts.
4. Implement or integrate an actual encoder/compositor without treating manifests as rendered video.
5. Add duplicate-safe provider idempotency and independently verify cost reservation.
6. Approve the Day 0 shot manifest and explicit spend ceiling.
7. Execute one paid Day 0 anchor-film generation under the approved ceiling.
8. Perform creative, continuity, rights, privacy, accessibility, device, and claim-evidence review.
9. Retain the final master, accessible variants, provider receipts, hashes, and rejection history.
10. Only then scale generation to the remaining anchor films and fourteen-day launch package.

## Release rule

Do not describe the system as autonomously generating final AAA+++ launch movies until the paid provider path, compositor, quality gates, evidence receipts, and one end-to-end anchor film are verified.