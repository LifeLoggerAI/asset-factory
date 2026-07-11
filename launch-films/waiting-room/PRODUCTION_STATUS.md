# Waiting Room Video Factory Status

## Current state

- Launch canon: defined in URAI Marketing draft PR.
- Anchor-film production manifest: created.
- Video production contract: created.
- Canonical Asset Factory video modality: not yet implemented.
- Paid video provider adapter: not yet verified.
- Deterministic video proof renderer: not yet implemented.
- Video compositor and accessible export pipeline: not yet implemented.
- Final public films: not generated.

## Immediate engineering sequence

1. Add canonical `video` asset type and aliases.
2. Add deterministic `video-local-proof` renderer for CI.
3. Add provider-neutral video request and receipt schema.
4. Wire one paid provider adapter behind spend caps and duplicate-safe retries.
5. Implement shot, film, caption, translation, and accessibility manifests.
6. Implement deterministic compositor for approved shots, audio, captions, and end cards.
7. Complete Day 0 end-to-end proof before scaling to all anchor films.

## Release rule

Do not describe the system as autonomously generating final AAA+++ launch movies until the paid provider path, compositor, quality gates, evidence receipts, and one end-to-end anchor film are verified.
