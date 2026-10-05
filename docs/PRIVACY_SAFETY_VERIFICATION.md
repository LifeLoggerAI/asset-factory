# Asset Factory Privacy and Safety Verification

Status: **BLOCKED UNTIL FINAL REVIEW AND LIVE TEST EVIDENCE**

Asset Factory must not be approved as production-ready until privacy, safety, support, account deletion/export, legal/trust/status pages, diagnostics redaction, auth, tenant-isolation, billing, and live dedicated-runtime evidence pass.

## Required production settings

```text
ASSET_FACTORY_FORCE_LOCAL=false
ASSET_FACTORY_REQUIRE_API_KEY=true
ASSET_FACTORY_REQUIRE_AUTH=true
ASSET_FACTORY_REQUIRE_JWT_SIGNATURE=true
ASSET_FACTORY_TENANT_CLAIM=tenantId
ASSET_FACTORY_ROLE_CLAIM=roles
ASSET_FACTORY_ALLOW_LEGACY_HEADER_AUTH=false
```

Secrets such as API keys, JWT signing material, cron secret, Stripe webhook secret, and provider credentials must remain in approved secret storage.

## Live privacy/safety proof

Current production proof must run only against the provider-proven dedicated `ASSET_FACTORY_BASE_URL`. Historical shared-host smoke is not current release evidence.

```bash
npm run test:launch-readiness
npm run test:completion-lock

test -n "$ASSET_FACTORY_BASE_URL"
ASSET_FACTORY_BASE_URL="$ASSET_FACTORY_BASE_URL" ASSET_FACTORY_SMOKE_READONLY=true npm run smoke:website

ASSET_FACTORY_BASE_URL="$ASSET_FACTORY_BASE_URL" \
ASSET_FACTORY_API_KEY=$PROD_ASSET_FACTORY_API_KEY \
ASSET_FACTORY_BEARER_TOKEN=$PROD_ASSET_FACTORY_BEARER_TOKEN \
ASSET_FACTORY_TENANT_ID=prod-smoke \
ASSET_FACTORY_OTHER_TENANT_ID=prod-smoke-denied \
CRON_SECRET=$PROD_CRON_SECRET \
npm run smoke:prod
```

Required evidence includes:

- public diagnostics are redacted;
- full diagnostics reject missing/wrong authorization;
- cross-tenant reads/downloads are denied;
- account export/deletion requests are tenant-authorized and audited;
- unsigned Stripe webhooks are rejected and valid events are idempotent;
- cron authorization fails closed;
- provider and storage responses do not leak secret material;
- legal/privacy/support/trust/status surfaces are reviewed;
- independent approval is retained where required.

## Final verdict

**BLOCKED.**

Repo guardrails are not a substitute for live dedicated-runtime proof and reviewer signoff.
