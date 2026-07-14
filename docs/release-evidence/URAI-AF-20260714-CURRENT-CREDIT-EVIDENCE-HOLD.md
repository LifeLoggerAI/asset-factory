# URAI Asset Factory current credit evidence hold

Recorded: 2026-07-14

## Accepted

- The user authorization for one V1 Spatial run capped at 47 provider calls and USD 47 total is recorded at commit `9f064d8da2ce0cf93aef20b388e4ae589009cac7`.
- The paid workflow remains hard-capped at 47 calls, USD 1.00 per call, USD 47.00 total, one attempt, promotion disabled.
- A billing notification dated 2026-07-07 records an API funding event of USD 49.85.
- A later notification dated 2026-07-09 records that monthly API spend reached the configured USD 100 alert.

## Not proven

- The current usable API credit balance on 2026-07-14 is not visible through the connected Platform tools.
- No later funding notification was found.
- No current API-key creation notification was found.
- The connected GitHub tool cannot securely install or inspect environment secrets.

## Gate

The July 7 funding event does not prove that at least USD 47 remains available today. Keep the paid marker absent until both conditions are independently satisfied:

1. `OPENAI_API_KEY` is installed and non-empty in the `paid-asset-generation` GitHub environment.
2. Current usable API credit is at least USD 47.

No provider request, generation, promotion, deployment, billing action, credential mutation, or production-data mutation was performed while creating this record.
