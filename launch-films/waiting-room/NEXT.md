# Next implementation step

The canonical `video` modality, deterministic `.animatic` renderer, guarded Replicate/Fal provider seam, video MIME serving, bounded policy, behavioral provider tests, local E2E lifecycle, deterministic package builder, accessible caption/audio-description manifests, social cuts, claim/evidence bindings, FFmpeg encoder proof, FFprobe verification, and Day 0 retained-artifact workflow are now implemented on this draft branch.

## Immediate gate

Allow the latest exact-head workflows to execute and inspect:

- typecheck;
- unit and behavioral tests;
- static multimodal and launch-readiness gates;
- Studio build;
- local multimodal E2E;
- Day 0 package files and hashes;
- encoded technical MP4 and receipt;
- Firebase/runtime/deploy preflight diagnostics;
- image pipeline proof.

Any failure must be repaired on a new exact head; stale workflow conclusions do not count.

## Next isolated engineering slice after green exact-head evidence

Implement paid-video transaction safety before making a provider call:

- tenant-scoped idempotency key bound to normalized video request hash;
- one durable provider attempt record per request generation;
- atomic cost reservation before dispatch;
- maximum per-job spend and maximum campaign spend;
- duplicate dispatch refusal;
- provider prediction ID and artifact URL receipt;
- actual billed-cost reconciliation;
- refund/release of unused reservation;
- bounded retry policy that cannot silently multiply spend;
- immutable rejection and human-review history.

Do not trigger a paid generation call until exact-head CI passes, provider transaction safety is independently reviewed, the Day 0 visual continuity package is approved, and an explicit model and maximum spend ceiling are authorized.