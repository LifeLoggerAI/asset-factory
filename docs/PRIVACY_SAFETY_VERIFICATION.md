# Asset Factory Privacy and Safety Verification

Date: 2026-05-17
Status: BLOCKED UNTIL FINAL REVIEW AND TEST EVIDENCE

## Decision

Asset Factory must not be approved as fully production-ready until privacy, safety, support, account deletion/export, legal/trust/status pages, diagnostics redaction, auth, and tenant-isolation evidence pass and are linked from release evidence.

## Privacy and safety gates

| Gate | Status | Required evidence |
| --- | --- | --- |
| Public copy avoids unsupported claims | Needs proof | Run banned/unsupported claim scan against README, launch docs, website copy, API manifest, Core dependency docs. |
| Diagnostics redaction | Needs proof | Public health/manifest must not expose secrets, tenant data, provider credentials, raw env, or private bucket paths. |
| Full diagnostics authorization | Needs proof | Full diagnostics must reject missing/wrong API key and pass only with authorized credentials. |
| Tenant isolation | Needs proof | Tenant A cannot read/list/download Tenant B jobs, manifests, generated files, queue entries, or billing state. |
| Auth enforcement | Needs proof | `ASSET_FACTORY_REQUIRE_AUTH=true` and `ASSET_FACTORY_REQUIRE_API_KEY=true` protected routes must enforce JWT/API key/tenant/role. |
| Storage privacy | Needs proof | Generated manifests/files must be tenant-scoped; signed/private download behavior must be verified where required. |
| Account deletion/export/support | Blocked | Account deletion/export/support workflows and route copy need final review. |
| Legal/trust/status pages | Blocked | Public website DNS/TLS/routes/legal/trust/status pages need verification. |
| Billing/entitlements | Needs proof | Stripe webhook signature verification and idempotent entitlement persistence must pass. |
| Audit events | Needs proof | Lifecycle, queue, billing, diagnostics, cron, and admin actions should emit auditable events with request IDs. |

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
Asset Factory has a production-smoked Firebase API slice and a deterministic local proof pipeline. The full product system remains launch-gated until auth, tenancy, provider-backed generation, worker, billing, observability, website, and production smoke evidence pass.
```

## Required production settings

```text
ASSET_FACTORY_FORCE_LOCAL=false
ASSET_FACTORY_REQUIRE_API_KEY=true
ASSET_FACTORY_API_KEY=<secret manager only>
ASSET_FACTORY_REQUIRE_AUTH=true
ASSET_FACTORY_JWT_ISSUER=<configured>
ASSET_FACTORY_JWKS_URI=<configured>
ASSET_FACTORY_JWT_AUDIENCE=<configured>
CRON_SECRET=<secret manager only>
STRIPE_WEBHOOK_SECRET=<secret manager only>
```

## Required tests before approval

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

The project has privacy/safety scaffolding and static guardrails, but production approval requires fresh executable proof and reviewer signoff. Do not approve public launch or Core dependency lock until this file, the launch readiness checklist, and the completion lock all point to the same passing evidence.
