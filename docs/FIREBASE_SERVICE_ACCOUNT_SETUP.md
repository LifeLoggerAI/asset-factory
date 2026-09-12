# Firebase Deployment Identity Setup — WIF Only

The filename is retained for compatibility with older links. It is **not** a service-account-key setup guide.

Asset Factory production deployment uses short-lived Google credentials obtained from GitHub OIDC through Google Workload Identity Federation. Do not create, download, paste, or store a JSON service-account key for this repository's production deployment path.

## Required GitHub protected configuration

Production workflow: **Asset Factory Production Readiness**

Protected environment:

```text
asset-factory-production
```

Required GitHub environment/repository variables:

```text
GCP_WIF_PROVIDER
GCP_DEPLOY_SERVICE_ACCOUNT
```

The deploy job requires `id-token: write`, passes the exact provider and service-account identifiers to `google-github-actions/auth@v2`, creates an ephemeral ADC credential file for the deploy steps, and deletes that file immediately after provider mutation.

## Google Cloud trust requirements

Before deployment, provider administration must prove:

- the WIF provider trusts only the intended LifeLoggerAI repository/ref/environment subjects;
- the impersonated service account belongs to the intended project and is the exact account referenced by protected configuration;
- IAM is resource-scoped and least privilege;
- Owner/Editor is not required;
- no user-managed service-account private key is needed;
- Cloud Audit attribution identifies the federated principal/service account;
- historical long-lived credentials are revoked where they previously existed.

## Production execution

After source/review/provider gates close, invoke:

```text
Actions -> Asset Factory Production Readiness -> Run workflow
branch = main
deploy = true
confirm = DEPLOY_ASSET_FACTORY
```

Do not substitute local CLI authentication when WIF is missing or broken. Missing `GCP_WIF_PROVIDER` or `GCP_DEPLOY_SERVICE_ACCOUNT` is a provider-admin blocker and must remain fail closed.

## Runtime identity

Google-managed production runtimes should use attached Application Default Credentials and an exact least-privilege runtime service account. Runtime identity is separate from deployment identity and must be verified independently.

## Evidence

A passing source workflow is not provider proof. Retain the authenticated principal, project/resource scope, deployed revision, exact source readback, audit correlation, monitoring, recovery, and distinct rollback evidence before calling the provider gate complete.
