# Asset Factory Privacy and Safety Verification

Date: 2026-05-20
Status: BLOCKED UNTIL FINAL REVIEW AND LIVE TEST EVIDENCE

## Decision

Asset Factory must not be approved as production-ready until privacy, safety, support, account deletion/export, legal/trust/status pages, diagnostics redaction, auth, and tenant-isolation evidence pass and are linked from release evidence.

Repo-side hardening is complete for the current pass, but privacy/safety approval remains gated on live staging/production evidence and reviewer signoff.

## Privacy and safety gates

| Gate | Status | Required evidence |
| --- | --- | --- |
| Public copy avoids unsupported claims | Needs proof | Run banned/unsupported claim scan against README, launch docs, website copy, API manifest, Core dependency docs. |
| Diagnostics redaction | Needs proof | Public health/manifest must not expose secrets, tenant data, provider credentials, raw env, or private bucket paths. |
| Full diagnostics authorization | Needs proof | Full diagnostics must reject missing/wrong API key and pass only with authorized credentials. |
| Tenant isolation | Needs proof | Tenant A cannot read/list/download Tenant B jobs, manifests, generated files, queue entries, support data, or billing state. |
| Auth enforcement | Needs proof | `ASSET_FACTORY_REQUIRE_AUTH=true`, `ASSET_FACTORY_REQUIRE_API_KEY=true`, `ASSET_FACTORY_REQUIRE_JWT_SIGNATURE=true`, and `ASSET_FACTORY_JWT_HS256_SECRET` must enforce signed bearer tokens, API key, tenant, and role checks. |
| Storage privacy | Needs proof | Generated manifests/files must be tenant-scoped; signed/private download behavior must be verified where required. |
| Account deletion/export/support | Needs final review | Account export and deletion-request routes exist; legal/privacy/support review and smoke evidence are still required before launch approval. |
| Legal/trust/status pages | Blocked | Public website DNS/TLS/routes/legal/trust/status pages need verification. |
| Billing/entitlements | Needs proof | Stripe webhook signature verification and idempotent entitlement persistence must pass. |
| Audit events | Needs proof | Lifecycle, queue, billing, diagnostics, cron, support, and admin actions should emit auditable events with request IDs. |

## Banned completion claims

Do not use these claims in public copy, README, launch notes, website, or Core dependency docs until completion lock is closed:

- `100% complete`
- `fully production ready`
- `fully wired`
- `fully verified`
- `system of systems complete`
- `all outputs delivered`
- `no roadmap remaining`

Allowed language until lock closes:

```text
Asset Factory repo-side hardening is complete for the current pass, with a production-smoked Firebase API slice and deterministic local proof pipeline. The full product system remains launch-gated until live staging/production auth, tenancy, provider-backed generation, worker, billing, observability, website, rollback, and production smoke evidence pass.
```

## Required production settings

```text
ASSET_FACTORY_FORCE_LOCAL=false
ASSET_FACTORY_REQUIRE_API_KEY=true
ASSET_FACTORY_API_KEY=<secret manager only>
ASSET_FACTORY_REQUIRE_AUTH=true
ASSET_FACTORY_REQUIRE_JWT_SIGNATURE=true
ASSET_FACTORY_JWT_HS256_SECRET=<secret manager only>
ASSET_FACTORY_JWT_ISSUER=<configured>
ASSET_FACTORY_JWT_AUDIENCE=<configured>
ASSET_FACTORY_TENANT_CLAIM=tenantId
ASSET_FACTORY_ROLE_CLAIM=roles
ASSET_FACTORY_ALLOW_LEGACY_HEADER_AUTH=false
CRON_SECRET=<secret manager only>
STRIPE_WEBHOOK_SECRET=<secret manager only>
```

Do not configure `ASSET_FACTORY_JWKS_URI` as a production dependency unless RS256/JWKS verification is implemented and tested in `assetAuth.ts`. The current synchronous Studio guard supports signed HS256 bearer tokens.

## Required tests before approval

Prefer the GitHub Actions workflow documented in `docs/OPERATIONS_RUNBOOK.md` and issue #63. Manual commands below are for debugging failed workflow runs.

```bash
npm run test:launch-readiness
npm run test:completion-lock
ASSET_FACTORY_SMOKE_READONLY=true ASSET_FACTORY_BASE_URL=https://urai-4dc1d.web.app npm run smoke:website
ASSET_FACTORY_BASE_URL=https://urai-4dc1d.web.app ASSET_FACTORY_API_KEY=$PROD_ASSET_FACTORY_API_KEY ASSET_FACTORY_BEARER_TOKEN=$PROD_ASSET_FACTORY_BEARER_TOKEN ASSET_FACTORY_TENANT_ID=prod-smoke ASSET_FACTORY_OTHER_TENANT_ID=prod-smoke-denied CRON_SECRET=$PROD_CRON_SECRET npm run smoke:prod
```

Custom domain after routing is fixed:

```bash
ASSET_FACTORY_SMOKE_READONLY=true ASSET_FACTORY_BASE_URL=https://uraiassetfactory.com npm run smoke:website
ASSET_FACTORY_BASE_URL=https://uraiassetfactory.com ASSET_FACTORY_API_KEY=$PROD_ASSET_FACTORY_API_KEY ASSET_FACTORY_BEARER_TOKEN=$PROD_ASSET_FACTORY_BEARER_TOKEN ASSET_FACTORY_TENANT_ID=prod-smoke ASSET_FACTORY_OTHER_TENANT_ID=prod-smoke-denied CRON_SECRET=$PROD_CRON_SECRET npm run smoke:prod
```

## Final privacy/safety verdict

BLOCKED.

The project has privacy/safety scaffolding, static guardrails, and current-pass repo-side hardening, but production approval requires fresh executable proof and reviewer signoff. Do not approve public launch or Core dependency lock until this file, the launch readiness checklist, issue #63, and the completion lock all point to the same passing evidence.