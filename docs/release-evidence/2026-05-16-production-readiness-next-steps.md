# Asset Factory Production Readiness Next Steps

Asset Factory is deployed and verified on the Firebase default production API base:

```text
https://urai-4dc1d.web.app
```

Asset Factory is not fully production-ready until the completion lock can move from `NOT LOCKED` to `LOCKED` with evidence.

## Current verified state

- Repo: `LifeLoggerAI/asset-factory`
- Branch: `main`
- Firebase project: `urai-4dc1d`
- Firebase Hosting site: `urai-4dc1d`
- Verified API base: `https://urai-4dc1d.web.app`
- Canonical custom-domain API: blocked
- Completion lock: `NOT LOCKED`

## Remaining production blockers

1. Custom-domain API routing for `https://uraiassetfactory.com/api/*` and `https://www.uraiassetfactory.com/api/*`.
2. Staging smoke with local fallback disabled.
3. Full auth/JWT/tenant/role proof.
4. Cross-tenant denial proof.
5. Real provider-backed generation proof.
6. Worker queue lease/retry/idempotency/DLQ proof.
7. Stripe entitlement persistence proof.
8. Diagnostics redaction and authorization proof.
9. Cron secret rejection/acceptance proof.
10. Observability proof.
11. Website DNS/TLS/legal/trust/status proof.
12. Rollback SHA and command proof.
13. Core dependency lock proof.

## Custom-domain blocker closure criteria

The blocker is closed only when all are true:

- `https://uraiassetfactory.com/api/health` returns the Asset Factory health response, not a Next.js 404 page.
- `https://www.uraiassetfactory.com` either redirects to the canonical host or serves the same Firebase-backed API surface.
- Read-only smoke passes on `https://uraiassetfactory.com`.
- Authenticated smoke passes on `https://uraiassetfactory.com`.
- Evidence is committed under `docs/release-evidence/`.

## Terminal commands to run after DNS/proxy is fixed

Run from the repo root:

```bash
cd ~/asset-factory
unset NPM_CONFIG_PREFIX
git pull --ff-only origin main
git status --short
```

Read-only smoke:

```bash
ASSET_FACTORY_BASE_URL=https://uraiassetfactory.com \
ASSET_FACTORY_SMOKE_READONLY=true \
npm run smoke:website
```

Authenticated smoke:

```bash
ASSET_FACTORY_BASE_URL=https://uraiassetfactory.com \
ASSET_FACTORY_API_KEY="$ASSET_FACTORY_API_KEY" \
ASSET_FACTORY_BEARER_TOKEN="$ASSET_FACTORY_BEARER_TOKEN" \
ASSET_FACTORY_TENANT_ID=prod-smoke \
ASSET_FACTORY_OTHER_TENANT_ID=prod-smoke-denied \
CRON_SECRET="$CRON_SECRET" \
npm run smoke:prod
```

Record custom-domain evidence after both pass:

```bash
mkdir -p docs/release-evidence

cat > docs/release-evidence/2026-05-16-custom-domain-api-verified.md <<EOF
# Asset Factory Custom Domain API Verification Evidence

- Environment: production custom domain
- Repo: LifeLoggerAI/asset-factory
- Branch: main
- Commit SHA: $(git rev-parse HEAD)
- Date/time: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
- Firebase project: urai-4dc1d
- Canonical API base: https://uraiassetfactory.com

## Commands

\`\`\`bash
ASSET_FACTORY_BASE_URL=https://uraiassetfactory.com ASSET_FACTORY_SMOKE_READONLY=true npm run smoke:website
ASSET_FACTORY_BASE_URL=https://uraiassetfactory.com ASSET_FACTORY_API_KEY="\$ASSET_FACTORY_API_KEY" ASSET_FACTORY_BEARER_TOKEN="\$ASSET_FACTORY_BEARER_TOKEN" ASSET_FACTORY_TENANT_ID=prod-smoke ASSET_FACTORY_OTHER_TENANT_ID=prod-smoke-denied CRON_SECRET="\$CRON_SECRET" npm run smoke:prod
\`\`\`

## Result

| Check | Result | Evidence |
| --- | --- | --- |
| Custom-domain health | pass | PASS /api/health |
| Read-only smoke | pass | PASS read-only production finalization smoke |
| Authenticated smoke | pass | PASS production finalization smoke |
| Custom-domain API routing | pass | /api/* no longer returns Next.js 404 |

## Decision

- [x] Custom-domain API routing accepted
- [x] Custom-domain read-only smoke accepted
- [x] Custom-domain authenticated smoke accepted
- [ ] Completion lock can be changed to LOCKED

## Notes

This evidence closes the custom-domain API routing blocker only. Remaining launch-lock gates must still pass before LOCKED status.
EOF

git add docs/release-evidence/2026-05-16-custom-domain-api-verified.md
git commit -m "Add custom domain API verification evidence for Asset Factory"
git push origin main
```

## Do not run before routing changes

Do not keep rerunning custom-domain smoke while `/api/health` returns a Next.js 404. That proves the domain is still not routed to the Asset Factory Firebase API surface.

## Lock rule

Do not change `docs/contracts/ASSET_FACTORY_COMPLETION_LOCK.md` to `LOCKED` until every P0 gate in the lock and `LAUNCH_READINESS.md` is passed with evidence.
