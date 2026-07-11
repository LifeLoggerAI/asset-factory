# URAI Asset Factory Waiting Room Video Foundation Receipt

**Receipt ID:** `URAI-AF-20260711-WAITING-ROOM-VIDEO-FOUNDATION-001`  
**Repository:** `LifeLoggerAI/asset-factory`  
**Pull request:** `#184`  
**Branch:** `feature/waiting-room-video-factory`  
**Base:** `main@de27f2f36aa1ca73d504e5dffed99161078fb0c8`  
**Implementation head before this receipt-only commit:** `1e13b43e4f634ec733d90acbd2861e4308db986f`  
**Control state:** Draft, mergeable, unmerged  
**Release verdict:** **HOLD — exact-head workflows and retained-artifact review required**

## Implemented boundary

This candidate implements the first executable, spend-bounded Waiting Room video-production foundation:

- canonical `video` jobs and aliases;
- deterministic `.animatic` proof artifacts;
- guarded Replicate/Fal video-provider transport;
- HTTPS-only artifact retrieval, private/local host refusal, timeout and byte ceilings, and video-format validation;
- required idempotency keys and normalized request hashes for paid video;
- atomic provider-cost reservation with per-job and per-campaign ceilings;
- one provider dispatch lease and bounded attempts;
- reservation-held failure behavior requiring operator reconciliation;
- deterministic timeline, captions, audio-description cues, crop plans, cutdowns, claim bindings, and immutable hashes;
- FFmpeg H.264/AAC technical-preview encoding with FFprobe verification and receipt hashes;
- a 70-second, nine-shot Day 0 `The Door` source package;
- accessible-source requirements for captions, audio description, and reduced motion.

## Queue and workflow repair

The prior PR view showed duplicate push and pull-request checks on the same feature head. This candidate repairs that condition:

- feature branches no longer start duplicate `push` copies of Asset Factory Pipeline Proof or Asset Factory Production Checks;
- `push` validation remains enabled for `main`;
- required workflows use exact reviewed-head checkout;
- clean-tree assertions are performed before verification;
- superseded runs cancel by PR/ref concurrency group;
- evidence artifact names include the exact reviewed SHA;
- evidence retention is 365 days;
- CI emits an exact-head roll-up receipt covering launch-readiness, root, engine, Studio, emulator, Functions, and LifeMap jobs.

Hardened workflow files:

- `.github/workflows/asset-factory-pipeline-proof.yml`
- `.github/workflows/asset-factory-production.yml`
- `.github/workflows/asset-factory-release-readiness.yml`
- `.github/workflows/production-readiness.yml`
- `.github/workflows/urai-production-verify.yml`
- `.github/workflows/ci.yml`

## Evidence classification

The following are implemented source capabilities, not production certification:

- local animatic generation;
- technical-preview MP4 encoding;
- provider transport adapters;
- transaction reservation and dispatch controls;
- package and receipt construction;
- workflow definitions.

The following remain unproven until current exact-head workflows complete and artifacts are independently inspected:

- typecheck, unit/static test, build, emulator, and E2E success on one unchanged head;
- successful Day 0 package and MP4 workflow artifacts;
- CI roll-up receipt with all jobs successful;
- provider security/release review;
- operator reconciliation and reservation-release authority;
- deployed-SHA claim bindings;
- final visual continuity, rights, score, voice, and accessibility approval;
- paid provider output;
- final public film;
- deployment and rollback.

## Mutation and spend statement

No pull request merge, deployment, Firebase mutation, production-data mutation, secret mutation, billing change, provider call, provider spend, or public-film promotion occurred while creating this receipt.

## Merge gate

Keep PR #184 draft. Do not merge, deploy, configure paid-provider secrets, or execute paid generation until all of the following are true on one unchanged final head:

1. Every required workflow is terminal and successful.
2. Exact-head package, preview, validation, and CI roll-up artifacts are downloaded and independently inspected.
3. Provider transport, transaction, reservation, and dispatch controls receive independent security/release review.
4. Operator reconciliation and reservation-release authority is implemented and tested.
5. Day 0 present-tense claims are bound to exact deployed-SHA product evidence.
6. Visual continuity, characters, wardrobe, orb, environment, rights, music, voice, privacy, accessibility, and negative-prompt controls are approved.
7. A provider/model and absolute maximum spend ceiling are explicitly authorized.
8. Bounded paid shot generation and final-master review complete with immutable receipts.
