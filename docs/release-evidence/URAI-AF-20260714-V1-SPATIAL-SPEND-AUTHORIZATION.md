# URAI Asset Factory V1 Spatial generation authorization

Recorded: 2026-07-14
Repository: `LifeLoggerAI/asset-factory`
Authorization base observed before record: `main@31c89176882865023e4b70793a07c847cc9e95eb`

## Exact user authorization

> I authorize one V1 Spatial generation run with no more than 47 provider calls and no more than $47 total spend.

## Bound execution contract

- Authorized operation: one V1 Spatial generation run.
- Maximum new provider calls: 47.
- Maximum unit cost: USD 1.00.
- Absolute maximum total spend: USD 47.00.
- Maximum attempts per provider request: 1.
- Provider: OpenAI.
- Endpoint: `https://api.openai.com/v1/images/generations`.
- Opaque model: `gpt-image-2`.
- Alpha model: `gpt-image-1.5`.
- Canonical output target: 53 files, including the previously proven Home seed.
- Promotion: disabled.
- Spatial activation: not authorized by this record.
- Deployment: not authorized by this record.
- Retry after a consumed marker: not authorized by this record.

## Remaining pre-execution proof

This authorization satisfies only the explicit cost-authorization prerequisite. Before the one-file paid marker may be created, retained evidence must still prove:

1. the `paid-asset-generation` GitHub environment exposes a nonempty `OPENAI_API_KEY` to the exact execute job; and
2. at least USD 47.00 of usable OpenAI API credit is available at execution time.

Until both are proven, provider execution remains blocked and the canonical marker file must remain absent.

## Evidence boundary

This record performs no provider call, generation, promotion, deployment, credential mutation, billing mutation, or production-data mutation.
