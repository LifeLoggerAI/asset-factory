# Replicate Google WIF bootstrap — Asset Factory

Status: operator handoff for the one remaining Google Cloud control-plane step.

Repository: `LifeLoggerAI/asset-factory`
Repository numeric ID: `1150887894`
Repository owner numeric ID: `215797546`
Google Cloud / Firebase project: `urai-4dc1d`
Google Cloud project number: `952723774155`
App Hosting backend: `assetfactory-studio`
Region: `us-central1`

## Goal

Establish short-lived GitHub Actions authentication to Google Cloud for the Asset Factory verification lane without creating or reusing a long-lived service-account JSON key.

The non-secret target identity is pinned in the governed workflows so a missing GitHub environment variable cannot conceal the actual Google-side state:

```text
GCP_WIF_PROVIDER=projects/952723774155/locations/global/workloadIdentityPools/urai-github/providers/asset-factory-github
GCP_DEPLOY_SERVICE_ACCOUNT=asset-factory-deploy@urai-4dc1d.iam.gserviceaccount.com
```

## Verified 2026-08-12 blocker

A protected, read-only GitHub Actions probe attempted federation directly against the exact provider resource above. `google-github-actions/auth@v3` reached Google STS and returned:

```text
invalid_target
The target service indicated by the "audience" parameters is invalid. This might either be because the pool or provider is disabled or deleted or because it doesn't exist.
```

The probe performed no Google Cloud mutation and no Replicate provider call. Its temporary workflow was removed after the diagnostic run.

This result means the current blocker is at the Workload Identity Pool/provider target itself, before service-account impersonation can be evaluated. Create or re-enable the pool/provider from an already-authorized Google Cloud administrator session.

## Required resource names

```text
Workload Identity Pool ID: urai-github
Provider ID: asset-factory-github
Provider resource: projects/952723774155/locations/global/workloadIdentityPools/urai-github/providers/asset-factory-github
Service account ID: asset-factory-deploy
Service account email: asset-factory-deploy@urai-4dc1d.iam.gserviceaccount.com
```

If an approved organization-wide GitHub Workload Identity Pool already exists, it may be used only after the workflow and this runbook are intentionally updated to that exact resource. Do not silently substitute a different provider.

## Security boundary

Do not create, download, restore, or upload a service-account JSON key for this workflow.

GitHub uses a shared OIDC issuer across organizations, so the provider must have an attribute condition. Use immutable GitHub numeric IDs rather than reusable organization/repository names.

Required mappings:

```text
google.subject=assertion.sub
attribute.repository=assertion.repository
attribute.repository_id=assertion.repository_id
attribute.repository_owner=assertion.repository_owner
attribute.repository_owner_id=assertion.repository_owner_id
```

Required provider condition:

```text
assertion.repository_owner_id == '215797546' && assertion.repository_id == '1150887894'
```

## Bootstrap commands

Run these commands only from a Google Cloud administrator session already authorized for project `urai-4dc1d`.

```bash
gcloud config set project urai-4dc1d
PROJECT_NUMBER="$(gcloud projects describe urai-4dc1d --format='value(projectNumber)')"
test "$PROJECT_NUMBER" = '952723774155'
```

### 1. Create or re-enable the GitHub Workload Identity Pool

```bash
gcloud iam workload-identity-pools describe urai-github \
  --project=urai-4dc1d \
  --location=global
```

If it does not exist and creation is authorized:

```bash
gcloud iam workload-identity-pools create urai-github \
  --project=urai-4dc1d \
  --location=global \
  --display-name='URAI GitHub Actions'
```

If it exists but is disabled, inspect why before re-enabling it. Do not replace a governed provider blindly.

### 2. Create or verify the Asset Factory GitHub provider

```bash
gcloud iam workload-identity-pools providers describe asset-factory-github \
  --project=urai-4dc1d \
  --location=global \
  --workload-identity-pool=urai-github
```

If it does not exist and creation is authorized:

```bash
gcloud iam workload-identity-pools providers create-oidc asset-factory-github \
  --project=urai-4dc1d \
  --location=global \
  --workload-identity-pool=urai-github \
  --display-name='Asset Factory GitHub Actions' \
  --issuer-uri='https://token.actions.githubusercontent.com/' \
  --attribute-mapping='google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_id=assertion.repository_id,attribute.repository_owner=assertion.repository_owner,attribute.repository_owner_id=assertion.repository_owner_id' \
  --attribute-condition="assertion.repository_owner_id == '215797546' && assertion.repository_id == '1150887894'"
```

Verify the provider reports an active state and the exact attribute mapping/condition above before proceeding.

### 3. Create or verify the least-privilege service account

```bash
gcloud iam service-accounts describe \
  asset-factory-deploy@urai-4dc1d.iam.gserviceaccount.com \
  --project=urai-4dc1d
```

If it does not exist and creation is authorized:

```bash
gcloud iam service-accounts create asset-factory-deploy \
  --project=urai-4dc1d \
  --display-name='Asset Factory deploy verifier'
```

Do not create a key for this service account.

### 4. Allow only the immutable Asset Factory repository identity to impersonate the service account

```bash
gcloud iam service-accounts add-iam-policy-binding \
  asset-factory-deploy@urai-4dc1d.iam.gserviceaccount.com \
  --project=urai-4dc1d \
  --role='roles/iam.workloadIdentityUser' \
  --member='principalSet://iam.googleapis.com/projects/952723774155/locations/global/workloadIdentityPools/urai-github/attribute.repository_id/1150887894'
```

### 5. Grant only the permissions required by the verification lane

The no-spend verification lane needs to inspect App Hosting, grant the App Hosting backend access to the existing `REPLICATE_API_TOKEN` secret, inspect secret metadata, and create a fresh App Hosting rollout. Use the narrowest roles that satisfy those exact operations.

Before broad project-level grants, inspect whether the required access can be granted directly on the existing Secret Manager secret and App Hosting resources. Retain an IAM receipt showing every granted role and resource scope.

The dedicated service account must be able to execute the exact governed commands used by the workflow:

```text
firebase apphosting:backends:get assetfactory-studio
firebase apphosting:secrets:grantaccess REPLICATE_API_TOKEN --backend assetfactory-studio
firebase apphosting:secrets:describe REPLICATE_API_TOKEN
firebase apphosting:rollouts:create assetfactory-studio --git_commit <EXACT_SHA>
```

Do not add Owner or Editor merely to make verification pass.

## GitHub configuration

The current governed workflows pin these non-secret values in source:

```text
projects/952723774155/locations/global/workloadIdentityPools/urai-github/providers/asset-factory-github
asset-factory-deploy@urai-4dc1d.iam.gserviceaccount.com
```

No WIF secret is required in GitHub. `REPLICATE_API_TOKEN` remains in Google Cloud Secret Manager and must never be copied into source or workflow output.

## Verification sequence

After Google IAM changes, allow for propagation before treating an immediate authentication failure as definitive.

1. Run `Grant Replicate App Hosting Secret Access` on exact current `main`.
2. Confirm GitHub OIDC exchanges successfully and the active Google identity is the dedicated Asset Factory service account.
3. Confirm App Hosting backend `assetfactory-studio` can access `REPLICATE_API_TOKEN` without printing the secret value.
4. Confirm a fresh rollout completes.
5. Confirm the live public manifest reports only sanitized Replicate readiness booleans as true.
6. Stop. A successful no-spend verification must **not** trigger a paid Replicate prediction.
7. Only after separate explicit spend authorization, manually dispatch `Replicate Bounded Model3D Smoke` from `main` and supply the exact confirmation phrase `RUN_ONE_REPLICATE_MODEL3D_SMOKE`.
8. The smoke must refuse a second paid prediction if issue #63 already contains a completion marker.
9. Retain the prediction ID, model/version, GLB hash/size, validation result, and cost receipt.
10. Do not mark Replicate end-to-end complete until both the protected verification and the separately authorized one-time GLB smoke pass.

## Completion evidence

Record all of the following in Asset Factory issue #63 and URAI Launch Control:

- WIF provider full resource name (non-secret)
- service-account email (non-secret)
- exact Google project number `952723774155`
- exact GitHub workflow run URL
- exact commit SHA
- successful OIDC/WIF authentication proof
- secret-read readiness result without secret disclosure
- rollout result
- separately authorized one-time Replicate prediction ID and bounded cost
- GLB validation/hash/size
- confirmation that no service-account JSON key exists for this lane
