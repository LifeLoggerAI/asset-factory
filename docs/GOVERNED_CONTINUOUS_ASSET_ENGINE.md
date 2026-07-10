# Governed Continuous Asset Engine

Operating principle: **Autonomous creation, deterministic validation, controlled promotion.**

## Architecture and gap analysis

The repository already had the important foundations: Firestore queue records, transactional leases, bounded attempts, a worker endpoint, provider-backed rendering, artifact manifests, approval records, usage events, and rollback metadata. The production gap was after claim: the worker materialized an asset and marked the queue item complete without deterministic output validation, an explicit risk decision, repository-aware promotion, required-check reconciliation, or automatic promotion rollback.

This change keeps the existing queue, renderer, storage, billing, and job documents as the source of truth. It adds a governed orchestration layer rather than a parallel job system.

```text
job request
  -> Firestore queue
  -> atomic lease claim
  -> idempotent materialization/reuse
  -> deterministic validation report
  -> configuration-driven policy decision
  -> manual review / reject / bounded retry / draft promotion PR
  -> required target-repository checks
  -> human merge
  -> reconcile, approve, and publish
  -> close PR and delete branch on failed required checks
```

## Phase 1 vertical slice

Phase 1 is production-capable for low-risk application assets promoted to `LifeLoggerAI/UrAi`:

- icons;
- backgrounds;
- environmental textures;
- ambient audio;
- non-sensitive scene assets.

The engine can classify and route content and spatial work, but those destinations remain fail-closed until their dedicated governed promotion checks exist. Avatars, identity assets, autobiographical interpretation, photorealistic human content, sensitive content, marketing claims, high-cost jobs, and low-confidence classifications always require manual review.

## State and audit records

Each attempt records:

- attempt and lease identifiers;
- worker identifier and timestamps;
- sanitized request fingerprint;
- provider and model configuration without credentials;
- estimated cost;
- output file name;
- validation report identifier;
- policy disposition and failure reason.

Validation reports are machine-readable and include format, manifest, provenance, size, dimensions or duration, cost, content-risk, ownership, and promotion-gate checks. Raw prompts are not copied into target repositories. Promotion manifests use a prompt hash and retain model, renderer, input-hash, and policy provenance.

## Controls

All risky behavior is disabled unless explicitly enabled:

| Control | Effect |
| --- | --- |
| `ASSET_FACTORY_CONTINUOUS_ENGINE_ENABLED=true` | Allows workers to claim jobs. |
| `ASSET_FACTORY_WORKERS_PAUSED=true` | Stops new claims without deleting queued work. |
| `ASSET_FACTORY_AUTO_PROMOTION_ENABLED=true` | Allows eligible assets to create draft promotion PRs. |
| `ASSET_FACTORY_PROMOTION_TOKEN` or `URAI_WHEEL_GITHUB_TOKEN` | Cross-repository branch and PR credential. |
| `ASSET_FACTORY_MIN_CLASSIFICATION_CONFIDENCE` | Raises or lowers the auto-approval confidence threshold. |
| `ASSET_FACTORY_MAX_AUTO_APPROVE_COST_CENTS` | Cost ceiling for automatic eligibility. |
| `ASSET_FACTORY_MAX_JOB_COST_CENTS` | Terminal per-job cost ceiling. |
| `ASSET_FACTORY_MAX_DAILY_COST_CENTS` | Fail-closed daily reserved-cost ceiling per tenant. |
| `ASSET_FACTORY_QUEUE_MAX_ATTEMPTS` | Bounded attempts. |
| `ASSET_FACTORY_QUEUE_BACKOFF_SECONDS` | Exponential retry base. |

The scheduled GitHub worker additionally requires repository variable `ASSET_FACTORY_CONTINUOUS_ENGINE_ENABLED=true`, an `asset-autonomy` protected environment, an HTTPS worker URL, and a worker secret.

## Promotion gates

A generated asset is never merged by the engine. The engine creates one isolated branch and a draft PR containing:

- the generated asset;
- a sanitized manifest;
- the machine-readable validation report.

The engine reconciles exact required check names from `config/asset-autonomy-policy.json`. Missing, pending, or failed checks do not produce approval. Failed checks close the PR, delete the isolated branch, and record a rollback. Successful checks leave the draft ready for human merge. Only a merged PR with all required checks successful is approved and published in Asset Factory state.

## Rollout

1. Merge and deploy Asset Factory with both engine flags disabled.
2. Merge the `UrAi` governed promotion gate.
3. Configure the protected `asset-autonomy` environment, worker URL, worker secret, and cross-repository token.
4. Enable the continuous engine while leaving auto-promotion disabled; observe validation and manual-review decisions.
5. Enable auto-promotion for a small tenant or test queue and monitor cost, retries, and draft PR quality.
6. Add equivalent promotion gates to `urai-content` and `urai-spatial` before enabling those routes.
7. Add post-deploy smoke status reconciliation and automatic revert PRs before permitting any future auto-merge policy.

## Rollback procedure

Set `ASSET_FACTORY_WORKERS_PAUSED=true` or disable the repository variable to stop new work. Set `ASSET_FACTORY_AUTO_PROMOTION_ENABLED=false` to keep generation and validation active while preventing new promotion PRs. Failed required checks are rolled back idempotently by closing the promotion PR and deleting its isolated branch. Existing application assets are never overwritten because every generated asset uses a deterministic, job-scoped path.
