# Asset Factory

URAI Asset Factory is the governed asset-generation and processing subsystem for deterministic proof assets, provider-backed generation seams, durable job handling, and Life Map handoff contracts.

## Launch authority

Current status is **source hardening in progress / live production certification not yet earned**.

Canonical launch truth is defined by `LAUNCH_READINESS.md`, `docs/OPERATIONS_RUNBOOK.md`, the protected GitHub workflows, and exact retained release evidence. Historical lock reports or older deploy instructions do not override those sources.

Production deployment authority is singular:

- workflow: **Asset Factory Production Readiness**;
- ref: exact `main` only;
- protected environment: `asset-factory-production`;
- explicit confirmation: `DEPLOY_ASSET_FACTORY`;
- Google authentication: GitHub OIDC + Workload Identity Federation;
- required GitHub variables: `GCP_WIF_PROVIDER` and `GCP_DEPLOY_SERVICE_ACCOUNT`;
- generated ADC credentials are ephemeral and removed before post-deploy smoke.

Root `deploy:*` shortcuts intentionally fail closed. Do not restore direct local Firebase deployment, interactive Firebase login, a Firebase CLI token, downloaded service-account JSON, or another long-lived Google deployment credential.

`Verify Deployed Asset Factory` is smoke-only. It verifies an existing target and cannot deploy.

## Domain truth

Do not treat `uraiassetfactory.com` or `www.uraiassetfactory.com` as this repository's live runtime until registrar/DNS/Firebase Hosting attachment and exact deployed-revision evidence are proven. A public page at those hosts is not hosting-authority proof.

## Repository structure

- `engine/` - deterministic core engine.
- `functions/` - retained root Functions package.
- `life-map-pipeline/functions/` - TypeScript Life Map ingestion Functions.
- `assetfactory-studio/` - Studio/API surface.
- `image_asset_generator/` - manifest-driven image generation/validation/export loop.
- `scripts/` - verification, smoke, evidence, and release-boundary tooling.
- `docs/` - governed operations, security, privacy, and release evidence.

## Local development

Use Node 22 for release-parity validation.

```bash
unset NPM_CONFIG_PREFIX
nvm install 22
nvm use 22
node scripts/setup-local.mjs
```

Local deterministic proof mode remains the safe default:

```bash
ASSET_FACTORY_FORCE_LOCAL=true
ASSET_FACTORY_MEDIA_PROVIDER=local-proof
```

Never commit real provider, Firebase, Stripe, auth, tenant, or operator secrets.

## Verification

Run the repo-owned fail-closed gates:

```bash
npm run doctor
npm run verify:local
npm run test:launch-readiness
npm run test:completion-lock
npm run check:deploy-workflow
```

The deployment-boundary gate verifies both the protected WIF workflow and operator-facing source so manual deployment bypasses cannot silently return.

## Remote smoke

Remote root smoke scripts are read-only by default. Preferred verification is the protected workflow:

```text
Actions -> Verify Deployed Asset Factory -> Run workflow
```

Choose `staging` or `production` and `readonly`, `authenticated`, or `both`. Authenticated mode still performs read-only checks and requires protected smoke credentials.

For a local diagnostic against an already-deployed target:

```bash
ASSET_FACTORY_BASE_URL=https://urai-4dc1d.web.app \
ASSET_FACTORY_SMOKE_READONLY=true \
npm run smoke:website
```

Do not use smoke output as deployment proof. Bind launch evidence to the exact deployed source SHA, provider revision, provider principal, health/readback, monitoring, recovery, and a distinct-revision rollback.

## Production prerequisites

Before launch, retain evidence for at least:

- protected WIF trust and least-privilege IAM;
- historical long-lived credential revocation where applicable;
- staging deployment and tenant-isolation proof;
- exact production deployment/revision readback;
- provider-backed generation and bounded spend;
- durable worker/retry/dead-letter behavior;
- Stripe entitlement/webhook correctness if billing is enabled;
- monitoring, recovery, and distinct rollback;
- domain/TLS/hosting authority;
- legal/privacy/security/support approval.

See `LAUNCH_READINESS.md` for the current gate matrix.
