# Next implementation step

The canonical `video` modality, deterministic `.animatic` renderer, guarded Replicate/Fal provider seam, video MIME serving, bounded policy, behavioral provider tests, and local E2E lifecycle are now implemented on this draft branch.

## Next isolated slice

Implement the deterministic video package/compositor contract that converts an approved animatic plus approved media references into:

- normalized timeline JSON;
- SRT and WebVTT captions;
- audio-description cue manifest;
- 16:9, 9:16, and 1:1 framing/crop instructions;
- 6-, 15-, 30-, 60-, and 90-second cut manifests;
- end-card and claim-evidence bindings;
- immutable package receipt with input hashes;
- explicit `rendered: false` state until an actual encoder produces and verifies the media master.

Do not trigger a paid generation call until exact-head CI passes, the provider security review is complete, an explicit spend ceiling is authorized, and the Day 0 shot manifest is approved.