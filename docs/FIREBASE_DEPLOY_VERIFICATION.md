# Asset Factory Firebase Deploy Verification

Current production verification is valid only for the provider-proven dedicated Asset Factory project/site/base URL supplied through the protected GitHub environment.

The shared consumer project `urai-4dc1d` is historical evidence only and is explicitly rejected by current production-target guards.

## Source gates

```bash
npm run verify:local
npm run test:launch-readiness
npm run check:deploy-workflow
npm run validate:production-target
```

Production deployment must use GitHub OIDC -> Google Workload Identity Federation -> least-privilege deploy service account. Long-lived Firebase tokens and service-account JSON are prohibited.

Required protected variables: `ASSET_FACTORY_FIREBASE_PROJECT_ID`, `ASSET_FACTORY_FIREBASE_HOSTING_SITE`, `ASSET_FACTORY_BASE_URL`, `GCP_WIF_PROVIDER`, and `GCP_DEPLOY_SERVICE_ACCOUNT`.

After a current exact-main deploy, verify the configured dedicated HTTPS base with `npm run deploy:verify-readonly`. Do not mark deployment verified until exact deployed revision, dedicated project/site, live base URL, TLS, health response, current SHA and rollback target are retained together.
