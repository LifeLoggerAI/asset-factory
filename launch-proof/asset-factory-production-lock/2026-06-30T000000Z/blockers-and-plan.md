# Blockers and Completion Plan

## P0 blockers

1. Fresh local/CI gates are not attached for this audit pass.
   - Required: doctor, launch-readiness, completion-lock, deploy-workflow, Studio lint/typecheck/test/build/e2e, image pipeline.

2. Staging is not proven with local fallback disabled.
   - Required: deploy/smoke workflow with `ASSET_FACTORY_FORCE_LOCAL=false` and authenticated tenant smoke.

3. Production is not proven with local fallback disabled.
   - Required: production deploy/smoke evidence against the launch target.

4. Real provider-backed generation is not proven.
   - Required: selected launch provider, model IDs, safety/cost/timeouts, and successful non-local generation receipts.

5. Durable worker path is not proven.
   - Required: queue creation, lease, processing, retry, fail, dead-letter, idempotency, retention cleanup, operator visibility.

6. Tenant isolation is not proven live.
   - Required: Tenant A cannot list/fetch/download/approve/publish Tenant B records or files.

7. Billing entitlement path is not proven live.
   - Required: Stripe signed webhook verification and idempotent entitlement persistence.

8. Observability is not proven.
   - Required: request IDs, structured logs, errors, latency, queue depth, cost/provider metrics, uptime checks, owner links.

9. Custom domain / public website / legal trust surfaces are not proven.
   - Required: DNS/TLS, route smoke, privacy/terms/status/trust pages.

## P1 blockers

1. Decide whether generated PNGs are tracked release artifacts or generated-only outputs.
2. Add source/license attribution if any non-deterministic/provider assets are checked in later.
3. Add consumer-repo verification proving UrAi, urai-spatial, urai-studio, urai-content, and urai-marketing consume the asset contract.
4. Run dependency audit with committed lockfiles or documented exception.
5. Validate Firebase rules and Storage read policies under real tenant-scoped paths.

## P2 blockers

1. Add preview screenshots or artifact thumbnails to release evidence after image pipeline runs.
2. Add cost ceiling and provider quota runbook links.
3. Add rollback proof for generated asset versions and published bundles.
4. Add release manifest naming/versioning convention for downstream consumers.

## P3 blockers

1. Improve docs with exact expected generated output counts and examples.
2. Add UX copy that labels deterministic local-proof outputs as proof assets, not final AI-generated production media.
3. Add automated stale-evidence detector for launch-proof folders.

## Completion plan to 100%

### Phase 1 - Fresh local proof

Run:

```bash
unset NPM_CONFIG_PREFIX
nvm install 22
nvm use 22
node scripts/setup-local.mjs
npm run doctor
npm run test:launch-readiness
npm run test:completion-lock
npm run check:deploy-workflow
npm --prefix assetfactory-studio run lint
npm --prefix assetfactory-studio run typecheck
npm --prefix assetfactory-studio test
npm --prefix assetfactory-studio run build
npm --prefix assetfactory-studio run e2e
python -m pip install -r image_asset_generator/requirements.txt
python image_asset_generator/run_pipeline.py
```

Attach logs plus `image_asset_generator/validation_report.json` and `image_asset_generator/asset_pack.zip` metadata/checksums.

### Phase 2 - Staging proof

Configure staging secrets:

- `ASSET_FACTORY_FORCE_LOCAL=false`
- `ASSET_FACTORY_REQUIRE_API_KEY=true`
- `ASSET_FACTORY_REQUIRE_AUTH=true`
- `ASSET_FACTORY_REQUIRE_JWT_SIGNATURE=true`
- Firebase Admin + Storage bucket
- selected provider keys/model IDs
- Stripe test webhook secret
- `CRON_SECRET`

Run GitHub Actions staging readonly smoke, staging deploy, and staging authenticated smoke.

### Phase 3 - Production proof

Repeat with production secrets and production tenants. Prove local fallback is disabled, provider generation works, queue/DLQ works, Stripe webhook persists entitlements, diagnostics are redacted, cron requires secret, and cross-tenant access fails.

### Phase 4 - Consumer proof

In each consumer repo, add evidence showing the asset contract is used or intentionally not used:

- UrAi
- urai-spatial
- urai-studio
- urai-content
- urai-marketing

### Phase 5 - Lock

Update completion lock only after all P0s have evidence links, rollback SHA/command is recorded, owner approval exists, and launch evidence is attached to the canonical tracker.

## Final recommendation

Keep status as PARTIAL until provider-backed, tenant-scoped, persisted, monitored staging and production evidence exists.
