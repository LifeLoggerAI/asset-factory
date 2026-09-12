# Production Deploy Runbook

This is the canonical Asset Factory production-deployment procedure.

## Current target

The production target is deliberately configuration-bound rather than hard-coded in source:

- Firebase/GCP project: protected `ASSET_FACTORY_PROJECT_ID` value; it must be a dedicated Asset Factory project and must not be `urai-4dc1d`;
- Firebase Hosting site: protected `ASSET_FACTORY_HOSTING_SITE` value; it must not be the consumer Hosting site `urai-4dc1d`;
- verification base: protected `ASSET_FACTORY_BASE_URL` value; it must be the dedicated Hosting origin or an explicitly allowed, proven Asset Factory custom domain and must not be `urai.app`, `www.urai.app`, or `urai-4dc1d.web.app`;
- protected GitHub environment: `asset-factory-production`;
- production workflow: **Asset Factory Production Readiness**.

A reachable historical target is not proof that the current candidate is deployed, and historical consumer-project receipts are not current Asset Factory authority.

## Preconditions

Before any production mutation, require:

- exact reviewed `main` SHA;
- required exact-head source checks terminal-success;
- eligible independent review where governance requires it;
- protected `ASSET_FACTORY_PROJECT_ID`, `ASSET_FACTORY_HOSTING_SITE`, and `ASSET_FACTORY_BASE_URL` values;
- protected `GCP_WIF_PROVIDER` and `GCP_DEPLOY_SERVICE_ACCOUNT` values;
- the deploy service account belongs to the dedicated Asset Factory project;
- provider-side WIF trust and least-privilege IAM evidence;
- no dependency on long-lived Firebase tokens or user-managed service-account keys;
- staging/provider prerequisites satisfied;
- rollback target identified and genuinely different from the candidate.

## Protected production deployment

Run only:

```text
Actions -> Asset Factory Production Readiness -> Run workflow
branch = main
deploy = true
confirm = DEPLOY_ASSET_FACTORY
```

The deploy job must run in `asset-factory-production`. It authenticates with GitHub OIDC + Google Workload Identity Federation, receives a generated ephemeral ADC credential file, verifies that file, validates the dedicated project/site/base-url binding, performs the bounded Firebase deployment through `scripts/run-dedicated-firebase-deploy.mjs`, deletes the generated credential file, and runs read-only post-deploy smoke.

There is no authorized root-package, nested-package, or local-shell production deploy path. Operator-facing `deploy:*` commands intentionally fail closed so local credentials cannot bypass environment approval, exact-head binding, dedicated-target validation, or WIF identity.

## Post-deploy acceptance

Capture and retain:

1. certified source SHA;
2. GitHub deployment workflow run;
3. exact authenticated Google principal;
4. dedicated project and Hosting site;
5. provider revision identifier;
6. proof that deployed revision maps to the exact source SHA;
7. health/readiness;
8. positive authorization and denied-auth/tenant checks;
9. monitoring/log visibility and alert owner;
10. recovery exercise;
11. rollback to a distinct known-good revision and live readback.

Then run the separate verification-only workflow as appropriate:

```text
Actions -> Verify Deployed Asset Factory -> Run workflow
environment = production
smoke_mode = readonly | authenticated | both
```

`authenticated` and `both` remain read-only modes; credentials are used to prove authorization and denial boundaries, not to create production proof jobs.

## Custom domain

Do not deploy or repoint `uraiassetfactory.com` or `www.uraiassetfactory.com` from this runbook. Reconcile registrar, authoritative DNS, TLS, and Firebase/custom-host attachment first. The protected production base URL must remain the dedicated provider origin until a custom domain has separately earned authority through exact live readback. Only after authority is proven may the minimum provider/domain correction be separately authorized.

## Failure handling

If dedicated target variables, WIF variables, provider trust, IAM, environment approval, exact-head identity, build, deployment, cleanup, or smoke fails, production remains blocked. Repair the actual failing boundary and rerun the protected workflow; do not substitute the consumer project, local authentication, or a long-lived credential.

## Rollback

Rollback must use protected provider authority and restore a different known-good revision on the same proven dedicated Asset Factory target. Record the restored provider revision and repeat critical health/auth checks. The same SHA redeployed twice is not rollback evidence.
