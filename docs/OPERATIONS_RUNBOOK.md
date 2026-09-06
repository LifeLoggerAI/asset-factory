# Asset Factory Operations Runbook

Use this runbook with `LAUNCH_READINESS.md` and the canonical production-lock issue. The readiness file is the go/no-go source of truth; this file defines the safe operator path.

## Operating rule

Source checks, historical deploy receipts, or a reachable URL do not by themselves certify a current release. Every launch claim must bind the exact source SHA to protected provider identity, the dedicated Asset Factory project/site, deployed revision, live readback, monitoring, recovery, and distinct rollback evidence.

## Production deployment authority

The only repository-owned production mutation path is:

```text
Actions -> Asset Factory Production Readiness -> Run workflow
branch = main
deploy = true
confirm = DEPLOY_ASSET_FACTORY
environment = asset-factory-production
```

The protected environment must provide non-empty `ASSET_FACTORY_PROJECT_ID`, `ASSET_FACTORY_HOSTING_SITE`, `ASSET_FACTORY_BASE_URL`, `GCP_WIF_PROVIDER`, and `GCP_DEPLOY_SERVICE_ACCOUNT`. The project/site/base URL must identify a dedicated Asset Factory target and must not resolve deployment authority to `urai-4dc1d`, `urai.app`, `www.urai.app`, or `urai-4dc1d.web.app`. The deploy service account must belong to the dedicated project.

The deploy job receives `id-token: write`, authenticates with GitHub OIDC + Google Workload Identity Federation, uses generated ephemeral ADC credentials, deploys only through the dedicated-target wrapper, removes the generated credential file immediately after deployment, then performs read-only smoke.

Do not restore direct local Firebase deployment, interactive Firebase login, a Firebase CLI token, downloaded service-account JSON, or another long-lived Google deployment identity. Root and nested operator-facing deploy scripts intentionally refuse provider mutation.

## Existing-deployment verification

Use:

```text
Actions -> Verify Deployed Asset Factory -> Run workflow
```

Inputs:

```text
environment = staging | production
smoke_mode = readonly | authenticated | both
```

This workflow is verification-only and cannot deploy. Production verification reads the protected `ASSET_FACTORY_BASE_URL`; it must not fall back to the consumer project. Authenticated mode is still read-only and uses protected smoke credentials only for authorization and tenant-denial checks.

## Staging boundary

There is currently no repository-owned staging deploy job in the two canonical workflows. Do not reinterpret the staging option in `Verify Deployed Asset Factory` as deployment authority. The staging-deploy gate stays open until an independently governed staging deployment path exists and exact provider/revision evidence is retained.

## Runtime identity

Production Google-managed runtimes use attached Application Default Credentials with a reviewed least-privilege runtime service account. Runtime configuration may include:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- protected Asset Factory API/auth secrets
- protected Stripe/provider/cron secrets when those capabilities are enabled

User-managed Firebase Admin private keys are not production runtime authority.

The current synchronous Studio auth guard supports signed HS256 bearer tokens. Production readiness requires signature verification to remain enabled with a protected `ASSET_FACTORY_JWT_HS256_SECRET` and legacy header authentication disabled; do not document RS256/JWKS as production authority until that verifier is implemented and tested in the runtime guard.

## Local source verification

```bash
npm run doctor
npm run verify:local
npm run test:launch-readiness
npm run test:completion-lock
npm run check:deploy-workflow
```

These are source gates only. They do not prove provider deployment.

## Read-only diagnostics

Against an already-deployed, proven dedicated Asset Factory target:

```bash
ASSET_FACTORY_SMOKE_READONLY=true \
ASSET_FACTORY_BASE_URL="$PROD_ASSET_FACTORY_BASE_URL" \
npm run smoke:website
```

`PROD_ASSET_FACTORY_BASE_URL` must be the same dedicated origin proven in protected provider configuration. Do not substitute the consumer Firebase project or an unproven custom domain.

Authenticated read-only smoke should normally be run through `Verify Deployed Asset Factory`, which enforces read-only mode globally and tests protected authorization/tenant boundaries without creating generation jobs or support mutations.

## Operator surfaces

Protected operator surfaces include the queue/DLQ console and tenant-support export/deletion-request workflows. Treat queue requeue and support deletion-request actions as governed mutations; do not invoke them merely to demonstrate launch readiness. Production acceptance requires purpose-limited test identities and retained audit evidence.

## Custom-domain gate

`uraiassetfactory.com` and `www.uraiassetfactory.com` remain untrusted as Asset Factory authority until registrar/DNS/Firebase Hosting attachment is proven and the hosts serve the intended exact deployment. Do not change DNS blindly. Before closure, prove:

- actual registrar/nameserver authority;
- actual authoritative DNS records and owner-controlled provider;
- actual dedicated Firebase/custom-host attachment;
- TLS and canonical-host behavior;
- Asset Factory health/authorization behavior;
- exact deployed source/revision binding;
- monitoring and rollback target.

## Incident response

For auth, tenant-isolation, diagnostics exposure, queue, billing, provider-cost, or webhook failures:

1. fail closed or restrict the affected capability;
2. preserve logs/audit evidence without exposing secrets;
3. identify the exact source and provider revision;
4. repair through reviewed source/provider authority;
5. re-run negative and positive verification;
6. retain recovery evidence before restoring capability.

## Rollback

A rollback counts only when a genuinely different known-good revision is restored through protected authority to the proven dedicated target, the provider confirms the different revision, and live health/auth checks pass on that restored revision. Redeploying the same SHA or writing rollback documentation is not rollback proof.

## Release evidence

Retain at minimum:

- exact source SHA and workflow run;
- protected environment and authenticated principal;
- dedicated project/site/base URL;
- least-privilege IAM receipt;
- deployed provider revision and source readback;
- health plus positive/denied auth checks;
- monitoring/log link and alert owner;
- recovery exercise identifier;
- distinct rollback source/revision and live readback.

Do not update a completion lock or production-ready claim until every applicable `LAUNCH_READINESS.md` gate is supported by current evidence.
