# URAI Asset Factory V1 paid-preflight root cause

- Repository: `LifeLoggerAI/asset-factory`
- Failed paid recovery run: `29386092833`
- Failed run authorized source: `e7a748d0840d5912a1870cf7adacd90cd8db9bcb`
- Read-only diagnostic run: `29445741570`
- Diagnostic artifact: `8355362035`
- Artifact digest: `sha256:1a28aab4b527cab0895721f025a48f14455396e6e717caf4b746d3dd64050624`

## Proven root cause

The protected `paid-asset-generation` environment contains an `OPENAI_API_KEY`. The diagnostic retained only the boolean configured state; it did not print, hash, transmit, or use the key.

The canonical catalog and manifests passed with exact counts V1 53, V2 80, V3 14, V4 39, and V5 27. Python source compilation and the canonical version contract also passed.

The exact failure was the mobile Life Map prompt contract. `life_map_galaxy_mobile` used the phrase `deep-space`, while the immutable paid preflight required each Life Map prompt independently to contain `deep outer space`.

The failed paid run stopped before generation. Provider calls, output generation, promotion, deployment, and spend were all zero.

## Bounded repair

- Change only the mobile Life Map wording from `deep-space` to `deep outer space` without changing its visual intent.
- Add a permanent source-only workflow that checks the canonical version contract and every required phrase independently for both desktop and mobile prompts.
- Keep provider secrets, paid environment entry, generation, and promotion outside the source verification workflow.

## Remaining authority

This repair does not authorize a new paid run. A new immutable owner authorization must bind the repaired exact main SHA before any provider call or spend is attempted.
