# URAI Waiting Room Video Factory Contract

Status: implementation candidate on draft PR #184; not production-certified  
Owner: Asset Factory + URAI Marketing + URAI Spatial

## Purpose

Make video a first-class Asset Factory modality for the fourteen-day URAI launch. The system must produce cinematic hero films, proof films, shorts, translations, accessibility variants, manifests, approvals, and immutable receipts without misrepresenting deterministic proof output or unreviewed provider output as finished production.

## Current implementation boundary

The draft candidate implements:

- canonical `video` type and aliases;
- deterministic `.animatic` proof output;
- guarded Replicate/Fal provider transport;
- H.264/AAC technical-preview encoding;
- captions, audio-description cues, crop and cutdown manifests;
- provider idempotency, atomic cost reservation, campaign ceilings, and one-attempt dispatch leases;
- operator settlement and pre-dispatch reservation release;
- a Day 0 source package and exact-head CI artifact receipts.

This source implementation is not final-film evidence. Queued checks, deterministic previews, configured provider names, and source adapters do not prove paid provider output, creative approval, deployment, or public-film readiness.

## Required asset family

Canonical type: `video`  
Aliases include `film`, `movie`, `short`, `reel`, `clip`, `mp4`, and `webm`.

Renderer modes:

- `video-animatic`: deterministic timeline/animatic output for contract and test coverage only;
- `video-provider`: external provider-backed shot generation under a reserved budget;
- `video-compositor`: deterministic assembly of approved shots, audio, captions, overlays, and end cards.

Default delivery formats:

- master: MP4 H.264, 3840x2160 or 2160x3840 according to aspect ratio;
- archive: mezzanine-quality MOV or lossless image sequence when supported;
- web: MP4 and WebM;
- captions: WebVTT and SRT;
- audio description: separate audio track and muxed accessible export.

## Job contract

Every final-production video job must bind:

- campaign id;
- launch day;
- film id;
- scene id;
- shot id;
- prompt version;
- visual canon version;
- character and likeness authority;
- source-asset references;
- duration target;
- aspect ratio;
- camera direction;
- performance direction;
- lighting and sound direction;
- continuity anchors;
- prohibited content;
- capability claim id;
- evidence class;
- provider and model id;
- provider request or prediction id;
- estimated, reserved, and actual cost;
- artifact content hash;
- approval state.

Provider-backed video creation additionally requires an `Idempotency-Key`. The normalized request hash binds tenant, campaign, provider, model, job id, prompt, metadata, dimensions, duration, and relevant request fields.

## Provider transaction lifecycle

Canonical transaction states:

1. `reserved` — cost exposure reserved; no provider attempt started;
2. `dispatching` — one provider attempt lease is active;
3. `artifact-ready-review` — provider artifact stored and hashed; human review required;
4. `failed-reservation-held` — provider attempt failed; reservation remains held for cost review;
5. `reconciled` — actual cost settled atomically against the campaign budget;
6. `released` — unused reservation released before any provider dispatch.

A transaction never becomes production-ready merely because an artifact exists or cost is reconciled.

## Cost reservation and settlement

At job creation:

- estimated cost must not exceed the configured per-job ceiling;
- total reserved plus spent campaign exposure must not exceed the campaign ceiling;
- reservation and budget changes must be atomic;
- replaying the same idempotency key and request returns the existing transaction;
- changing the request under the same idempotency key is a conflict.

At materialization:

- exactly one provider attempt lease is issued by default;
- concurrent or repeated materialization cannot create a second paid call;
- failed attempts hold the reservation instead of silently retrying;
- successful artifacts remain review-required and production-not-ready.

At operator review:

- `POST /api/admin/video-transactions/reconcile` settles actual cost using one explicit resolution:
  - `artifact-accepted`;
  - `artifact-rejected`;
  - `failed-cost-settled`;
  - `provider-refund`;
- campaign `reservedCostCents` and `spentCostCents` update atomically with transaction state;
- actual cost cannot exceed the job or campaign ceiling;
- refund settlement must use zero actual cost;
- reconciliation records operator identity, timestamp, resolution, and optional note.

Before dispatch only:

- `POST /api/admin/video-transactions/release` may release an unused reservation;
- release is refused after `attemptCount` becomes nonzero or state leaves `reserved`;
- post-dispatch work must be reconciled against provider evidence, not released as though no call occurred.

Both admin routes require operator-level authorization and write usage/audit events.

## Evidence classes

Each shot and finished film must carry exactly one label:

- LIVE_VERIFIED
- VERIFIED_SYSTEM_DEMO
- CERTIFIED_DEVICE_INTEGRATION
- PROTOTYPE
- VISION

A film may include multiple classes, but the final manifest must map every shot to its class. The public cut must not visually erase those boundaries.

## Production stages

1. Canon lock
2. Script lock
3. Shot manifest generation
4. Storyboard generation
5. Character and environment continuity lock
6. Provider generation
7. Automated technical QC
8. Human creative review
9. Product-truth review
10. Privacy and claims review
11. Edit and compositing
12. Caption, translation, and audio-description generation
13. Final accessibility QC
14. Cost reconciliation
15. Approval
16. Publish bundle creation
17. Immutable receipt and rollback bundle

## Autonomous responsibilities

The system may autonomously:

- generate scripts, shot lists, storyboards, prompt packs, and cutdown plans;
- create provider jobs within explicitly authorized models and budgets;
- reject outputs that fail technical or canon checks;
- retry only when the transaction authority explicitly permits another bounded attempt;
- assemble rough cuts and approved final cuts;
- generate captions, translations, audio descriptions, thumbnails, posters, and social crops;
- run route, device, and receipt captures for proof films;
- package provenance, cost, model, prompt, and approval receipts.

## Human authority gates

The system must stop for explicit approval before:

- using a real person's likeness or voice;
- publishing private records or sensitive personal facts;
- making medical, clinical, emergency, legal, financial, or safety claims;
- publishing economic promises or crowdfunding terms;
- exceeding or changing a configured spend cap;
- accepting or rejecting a provider artifact for final production;
- releasing a final public master.

## AAA+++ quality gates

A film cannot be approved unless all applicable gates pass:

- temporal consistency;
- character identity consistency;
- anatomy and hand integrity;
- environment continuity;
- camera-motion stability;
- readable UI and typography;
- no unintended logos or copyrighted marks;
- no visible provider watermarks;
- dialogue intelligibility;
- music and sound rights recorded;
- caption timing and accuracy;
- audio-description quality;
- color, exposure, and compression review;
- mobile-safe crop review;
- reduced-motion alternative where required;
- factual claim-to-evidence mapping;
- privacy and consent review;
- final product continuity review.

## Cost and retry controls

- Every provider-backed job requires a maximum provider budget.
- Campaign and job ceilings fail closed before dispatch.
- Retries are bounded per shot and default to one attempt.
- Duplicate-safe request hashes prevent repeated paid generations.
- Provider fallbacks require explicit priority order and a new reviewed request binding when model/provider changes.
- No job may silently switch to a lower-quality provider for final output.
- Local proof output must never be labeled as provider-generated film.
- Cost reservations remain held until atomic settlement or valid pre-dispatch release.

## Launch package output

For every daily theme, produce:

- one 45-90 second hero film, except Day 14 at 120-180 seconds;
- one 30-90 second proof film;
- one 6-10 second hook;
- one 15-30 second meaning short;
- one 20-45 second proof short;
- 16:9, 9:16, and 1:1 exports;
- captioned, silent-caption, translated, audio-described, and reduced-motion variants;
- thumbnail, poster, and press stills;
- source, prompt, provider, cost, rights, approval, and evidence manifests.

## Initial production order

1. Day 0 — The Doorway Exists
2. Day 1 — Movies of Life
3. Day 2 — This Is Real
4. Day 7 — Ask Me First
5. Day 8 — Life Becomes a Place
6. Day 14 — The World Opens

These anchor films establish the visual and narrative canon before the remaining daily films are generated.

## Definition of done

The autonomous video factory is production-ready only when:

- `video` is implemented as a canonical modality;
- at least one paid provider adapter is live, credentialed, and independently reviewed;
- provider outputs can be reserved, dispatched, stored, fetched, reviewed, reconciled, approved, and published through the canonical job pipeline;
- deterministic proof output exists for CI without paid calls;
- compositor and caption pipelines are reproducible;
- spend caps, idempotency, transaction settlement, and bounded retries are enforced;
- the Day 0 anchor film completes end to end;
- all receipts, accessibility variants, and rollback assets are attached;
- the final public master passes human creative, product-truth, privacy, accessibility, rights, financial, and claims approval.
