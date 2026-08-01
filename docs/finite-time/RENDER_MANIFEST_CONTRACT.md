# FINITE TIME — Governed Render Manifest Contract

Parent authority: LifeLoggerAI/urai-storytime#27
Execution issue: #202

## Purpose

Extend Asset Factory's deterministic proof and governed provider model into a reusable feature-film production lane without bypassing launch-readiness, auth, quota, provenance, approval, or no-spend controls.

## Required manifest entities

- project
- sequence
- scene
- shot
- characterAgeAnchor
- locationState
- propVehicleWardrobe
- voicePerformance
- musicCue
- foleyEvent
- captionTrack
- audioDescriptionTrack
- hapticCueTrack
- renderJob
- reviewDecision
- promotedAsset
- editorialExport

## Every render job records

- immutable project/scene/shot IDs and versions
- opaque private source-authority IDs only
- modality, provider, model, tool, adapter, prompt, seed, and renderer versions
- input and output content hashes
- sensitivity and rights state
- cost estimate, approved ceiling, actual cost, and authorization identity
- retry lineage and idempotency key
- storage path and retention class
- continuity fingerprints
- accessibility dependencies
- reviewer, decision, reason, and promotion state

## State machine

`draft -> validated -> budget-approved -> queued -> rendering -> materialized -> qa -> approved | rejected -> promoted -> archived`

Rejected, failed, unreviewed, over-budget, unlicensed, or provenance-incomplete assets cannot be promoted.

## Provider boundary

Local deterministic proof mode is required first. Provider-backed image, video, animation, TTS, music, model3d, and bundle adapters require explicit owner authorization and a configured hard budget ceiling. No uncontrolled batch generation is permitted.

## Proof chapter

Create one immutable Farm-to-Lake job pack that can regenerate storyboards, animatic proxies, review galleries, final-quality candidate shots, stems/manifests, captions, audio-description script, and haptic cue data.

## Quality gates

- character identity and age continuity
- location/prop/wardrobe continuity
- anatomy, motion, flicker, and temporal consistency
- historical and source-boundary checks
- dignity and sensitive-content review
- sound/music/dialogue alignment
- accessibility completeness
- exact provenance and retained evidence

This contract does not authorize provider spend or claim the feature is rendered.
