# Asset Factory Production Operations

This document records the production operating boundary for `LifeLoggerAI/asset-factory`.
It is an operator guide, not proof that a provider, backup feature, deployment, or recovery control is currently active.

## Authority

Before any production-changing action:

1. resolve the live Asset Factory pull-request or `main` exact SHA;
2. resolve the intended dedicated Firebase/App Hosting project and backend;
3. verify protected WIF/OIDC identity from the `asset-factory-production` environment;
4. verify whether the action creates a rollout, changes live traffic, or can spend provider credits;
5. retain exact-head evidence after the action.

Historical `urai-4dc1d`, `asset-factory-dev-id`, historical shared WIF identities, and predecessor receipts are not final Asset Factory production authority.

## Deployment

The governed production hosting lane is Firebase App Hosting. Vercel is not the production deployment authority described by this repository.

Protected App Hosting verification and rollout workflows must:

- use keyless GitHub OIDC -> Google Workload Identity Federation;
- use the dedicated production project/WIF/service-account variables from the protected environment;
- reject historical shared-project authority;
- bind a rollout to an exact Git commit;
- keep provider spend separately fail-closed;
- never print secret values.

A rollout is a production mutation. Source correctness or a green pull-request check does not itself authorize a rollout.

## Provider spend

All multimodal selectors default to `local-proof`.
`ASSET_FACTORY_PROVIDER_SPEND_AUTHORIZED=false` is the normal fail-closed production configuration until a separately governed provider execution is approved.

Credential presence does not authorize spend.
Provider candidates do not auto-promote into canonical UrAi assets.

The one-time Replicate model3d smoke is a separate paid lane with its own exact confirmation phrase and one-time completion guard. Do not use the App Hosting secret-access verification as an excuse to run the paid smoke.

## Secrets

Provider credentials belong in approved server-side secret storage and must never be committed, exposed through `NEXT_PUBLIC_*`, echoed in logs, or copied into receipts.

The protected Replicate App Hosting path may verify secret metadata/access without displaying the secret value.

## Backup and recovery truth boundary

Do not assume Firestore point-in-time recovery, Cloud Storage object versioning, lifecycle policies, backup schedules, RTO, or RPO merely because they are desirable controls.

Before relying on any recovery feature, verify its current project configuration in the actual production project and preserve evidence of that configuration.

When recovery is required:

1. identify the exact production project/backend and incident scope;
2. preserve logs and the current deployment/provider state;
3. verify the available Firestore/Storage recovery mechanisms in that project;
4. choose the smallest safe restore or rollback operation;
5. verify application health, provider readiness, data integrity, and exact deployed revision afterward.

## Evidence required for production certification

A production claim should identify, as applicable:

- exact Git SHA;
- workflow/run ID;
- intended Firebase project and App Hosting backend;
- WIF/service-account identity without secret material;
- rollout/deployment receipt;
- sanitized readiness manifest;
- provider no-spend or explicitly authorized paid-smoke receipt;
- artifact hashes and provenance;
- rollback/recovery evidence when exercised;
- independent review state.

If evidence is missing, report the precise blocker instead of assuming the control is configured.
