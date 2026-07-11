# URAI Waiting Room Video Factory Contract

Status: draft production contract
Owner: Asset Factory + URAI Marketing + URAI Spatial

## Purpose

Make video a first-class Asset Factory modality for the fourteen-day URAI launch. The system must produce cinematic hero films, proof films, shorts, translations, accessibility variants, manifests, approvals, and immutable receipts without misrepresenting provider output as finished production.

## Required asset family

Add canonical type `video` with aliases including `film`, `movie`, `short`, `reel`, `clip`, `mp4`, and `webm`.

Required renderer modes:

- `video-local-proof`: deterministic slate/animatic output for contract and test coverage only.
- `video-provider`: external provider-backed shot generation.
- `video-compositor`: deterministic assembly of approved shots, audio, captions, overlays, and end cards.

Default delivery formats:

- master: MP4 H.264, 3840x2160 or 2160x3840 according to aspect ratio
- archive: mezzanine-quality MOV or lossless image sequence when supported
- web: MP4 and WebM
- captions: WebVTT and SRT
- audio description: separate audio track and muxed accessible export

## Job contract

Every video job must include:

- campaign id
- launch day
- film id
- scene id
- shot id
- prompt version
- visual canon version
- character and likeness authority
- source-asset references
- duration target
- aspect ratio
- camera direction
- performance direction
- lighting and sound direction
- continuity anchors
- prohibited content
- capability claim id
- evidence class
- provider and model id
- provider request id
- estimated and actual cost
- content hash
- approval state

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
14. Approval
15. Publish bundle creation
16. Immutable receipt and rollback bundle

## Autonomous responsibilities

The system may autonomously:

- generate scripts, shot lists, storyboards, prompt packs, and cutdown plans;
- create provider jobs under approved budgets;
- reject outputs that fail technical or canon checks;
- regenerate bounded failed shots;
- assemble rough cuts and approved final cuts;
- generate captions, translations, audio descriptions, thumbnails, posters, and social crops;
- run route, device, and receipt captures for proof films;
- package provenance, cost, model, prompt, and approval receipts.

## Human authority gates

The system must stop for explicit approval before:

- using a real person's likeness or voice;
- publishing founder-story facts or private records;
- making medical, clinical, emergency, legal, financial, or safety claims;
- publishing economic promises or crowdfunding terms;
- exceeding a configured spend cap;
- releasing a final public master.

## AAA+++ quality gates

A film cannot be approved unless all applicable gates pass:

- temporal consistency
- character identity consistency
- anatomy and hand integrity
- environment continuity
- camera-motion stability
- readable UI and typography
- no unintended logos or copyrighted marks
- no visible provider watermarks
- dialogue intelligibility
- music and sound rights recorded
- caption timing and accuracy
- audio-description quality
- color, exposure, and compression review
- mobile-safe crop review
- reduced-motion alternative where required
- factual claim-to-evidence mapping
- privacy and consent review
- final product continuity review

## Cost and retry controls

- Every job requires a maximum provider budget.
- Retries must be bounded per shot.
- Duplicate-safe content hashes prevent repeated paid generations.
- Provider fallbacks require explicit priority order.
- No job may silently switch to a lower-quality provider for final output.
- Local proof output must never be labeled as provider-generated film.

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
- at least one paid provider adapter is live and credentialed;
- provider outputs can be stored, fetched, approved, and published through the canonical job pipeline;
- deterministic proof output exists for CI without paid calls;
- compositor and caption pipelines are reproducible;
- spend caps and duplicate-safe retries are enforced;
- the Day 0 anchor film completes end to end;
- all receipts, accessibility variants, and rollback assets are attached;
- the final public master passes human creative, product-truth, privacy, and claims approval.
