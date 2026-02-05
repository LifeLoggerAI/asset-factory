# Asset Factory

Asset Factory is the automated content and artifact generation system for the URAI ecosystem.

It produces visual, audio, and narrative assets used across:
- Product experiences
- Marketing and growth pipelines
- User-generated memory artifacts
- Shareable cinematic outputs

## Capabilities

- Video rendering (short-form, long-form, reels)
- Image and visual asset generation
- Audio and voice-over synthesis
- Narrative and storyboard generation
- Deterministic rendering via job manifests
- Scalable worker-based execution

## Architecture

Asset Factory operates as:
- Job-driven pipeline system
- Deterministic inputs → reproducible outputs
- Horizontally scalable workers
- Observable and auditable execution

## Relationship to Other Repos

- `urai-jobs`: execution orchestration
- `urai-analytics`: performance tracking
- `urai-admin`: operational oversight
- `asset-factory`: **artifact creation**

## Status

This system is actively evolving.
All outputs are traceable via manifests and job IDs.
