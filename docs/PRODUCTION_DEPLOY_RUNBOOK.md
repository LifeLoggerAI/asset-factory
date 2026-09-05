# Production Deploy Runbook

This is the canonical Asset Factory production-deployment procedure.

## Current target

- Firebase project: `urai-4dc1d`
- current Firebase verification base: `https://urai-4dc1d.web.app`
- protected GitHub environment: `asset-factory-production`
- production workflow: **Asset Factory Production Readiness**

A reachable historical target is not proof that the current candidate is deployed.

## Preconditions

Before any production mutation, require:

- exact reviewed `main` SHA;
- required exact-head source checks terminal-success;
- eligible independent review where governance requires it;
- protected `GCP_WIF_PROVIDER` and `GCP_DEPLOY_SERVICE_ACCOUNT` values;
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

The deploy job must run in `asset-factory-production`. It authenticates with GitHub OIDC + Google Workload Identity Federation, receives a generated ephemeral ADC credential file, verifies that file, performs the bounded Firebase deployment in the workflow, deletes the generated credential file, and runs read-only post-deploy smoke.

There is no authorized root-package or local-shell production deploy path. Root `deploy:*` commands intentionally fail closed so operator credentials cannot bypass environment approval, exact-head binding, or WIF identity.

## Post-deploy acceptance

Capture and retain:

1. certified source SHA;
2. GitHub deployment workflow run;
3. exact authenticated Google principal;
4. target project and resource set;
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

Do not deploy or repoint `uraiassetfactory.com` or `www.uraiassetfactory.com` from this runbook. Reconcile registrar, nameserver, TLS, and Firebase/custom-host attachment first. Only after authority is proven may the minimum provider/domain correction be separately authorized.

## Failure handling

If WIF variables, provider trust, IAM, environment approval, exact-head identity, build, deployment, cleanup, or smoke fails, production remains blocked. Repair the actual failing boundary and rerun the protected workflow; do not substitute local authentication or a long-lived credential.

## Rollback

Rollback must use protected provider authority and restore a different known-good revision. Record the restored provider revision and repeat critical health/auth checks. The same SHA redeployed twice is not rollback evidence.
