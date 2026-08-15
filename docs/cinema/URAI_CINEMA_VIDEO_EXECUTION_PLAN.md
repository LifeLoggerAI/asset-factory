# URAI Cinema — Governed Video / Animation Execution Lane

## Objective
Turn Asset Factory from a graphics/3D/audio generator into the shot-execution layer for URAI Cinema, where outside models are replaceable providers and URAI owns direction, continuity, provenance, budget, QA, editorial assembly, and release gates.

## Architecture
`project -> sequence -> scene -> shot -> renderJob -> candidate -> QA -> approvedShot -> editorialExport`

A provider may generate a candidate shot. A provider never owns the movie.

## Phase 1 — Canonical motion primitive (this PR)
- Add `video` as a first-class canonical asset family/type.
- Add `video-renderer` renderer mode.
- Store and serve MP4/WebM as governed generated assets.
- Add duration, FPS, motion-strength, reference-image and reference-video validation.
- Add per-video cost/unit estimation so existing monthly quota/budget enforcement applies before queueing.
- Fail closed in local-proof mode; URAI must never label Ken Burns/still motion as generated video.
- Add a dedicated provider runtime with Replicate execution and server-approved fal/Runway endpoint slots.
- Keep request-level provider input overrides disabled unless explicitly enabled by server policy.
- Stamp candidate manifests with mandatory motion QA categories.

## Phase 2 — Provider broker
Create a Cinema broker that ranks configured providers per shot using declared requirements:
- text-to-video vs image-to-video vs video-to-video
- identity/likeness sensitivity
- motion complexity
- camera-control requirements
- duration/resolution
- expected cost and approved ceiling
- provider health/latency

The broker must support retry lineage without losing the immutable shot identity.

## Phase 3 — Continuity + shot QA
Every candidate shot is scored before promotion for:
- identity continuity
- face drift
- hands/anatomy
- temporal flicker
- hair/clothing continuity
- prop/vehicle/location continuity
- camera-motion compliance
- lighting continuity
- text/logo contamination
- privacy/rights boundary
- source truthfulness

Failed candidates remain retained as evidence but cannot enter the editorial timeline.

## Phase 4 — Editorial compiler
Build a deterministic editorial export from approved shot IDs:
- handles and transition windows
- motivated transitions (movement, gaze, light, shape, sound)
- real source footage insertion
- score/music stems
- dialogue and environment stems
- foley
- captions/SRT
- color transform metadata
- 24 fps vertical 4K master and sendable derivative

The compiler consumes approved shots only; it does not silently substitute storyboard stills.

## Phase 5 — Night Shift to Nurse proof project
Use `night-shift-nurse-short` as the first end-to-end proof.

Private-only constraints:
- real subject footage remains the identity anchor
- no voice cloning
- no public release without subject consent
- license plate obscured
- college/concert future scenes are explicitly symbolic unless documentary source exists
- no commercial BTS masters, logos, choreography, likenesses, or copyrighted poster art

### Planned moving shots
1. Rainy Everyday Mart exterior / arrival
2. Black sedan stop / headlight reflection transition
3. Natural in-store movement
4. Genuine personality insert from real subject footage
5. Cooler stocking action
6. Through-glass turning-point transition
7. Symbolic college future walk
8. Active nursing-study scene
9. Generic pop-concert dream beat
10. Real-subject hero close

## Promotion rule
A finished MP4 is `READY_PRIVATE_DELIVERY` only when every timeline segment is either:
- approved real footage, or
- an approved generated moving shot.

Static storyboard images, camera pans over stills, and unreviewed provider output cannot satisfy the motion gate.
