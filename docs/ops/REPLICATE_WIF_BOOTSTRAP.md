# Replicate Google WIF bootstrap — Asset Factory

Status: operator handoff for the one remaining Google Cloud control-plane step.

Repository: `LifeLoggerAI/asset-factory`
Repository numeric ID: `1150887894`
Repository owner numeric ID: `215797546`
Google Cloud / Firebase project: `urai-4dc1d`
App Hosting backend: `assetfactory-studio`
Region: `us-central1`

## Goal

Establish short-lived GitHub Actions authentication to Google Cloud for the Asset Factory verification lane without creating or reusing a long-lived service-account JSON key.

The existing workflow expects two non-secret GitHub environment variables:

```text
GCP_WIF_PROVIDER
GCP_DEPLOY_SERVICE_ACCOUNT
```

## Recommended resource names

```text
Workload Identity Pool ID: urai-github
Provider ID: asset-factory-github
Service account ID: asset-factory-deploy
Service account email: asset-factory-deploy@urai-4dc1d.iam.gserviceaccount.com
```

If an approved organization-wide GitHub Workload Identity Pool already exists, reuse that pool instead of creating a duplicate. Keep a dedicated provider or an attribute condition that restricts trust to this repository.

## Security boundary

Do not create, download, restore, or upload a service-account JSON key for this workflow.

GitHub uses a shared OIDC issuer across organizations, so the provider must have an attribute condition. Prefer immutable GitHub numeric IDs over reusable organization/repository names.

Required mappings:

```text
google.subject=assertion.sub
attribute.repository=assertion.repository
attribute.repository_id=assertion.repository_id
attribute.repository_owner=assertion.repository_owner
attribute.repository_owner_id=assertion.repository_owner_id
```

Recommended provider condition:

```text
assertion.repository_owner_id == '215797546' && assertion.repository_id == '1150887894'
```

The numeric IDs above were read directly from the connected GitHub repository metadata for `LifeLoggerAI/asset-factory` on 2026-08-11. Optionally add a `ref` or protected-environment condition if compatible with the workflow's intended triggers.

## Bootstrap commands

Run these commands only from a Google Cloud administrator session authorized for project `urai-4dc1d`.

```bash
gcloud config set project urai-4dc1d
PROJECT_NUMBER="$(gcloud projects describe urai-4dc1d --format='value(projectNumber)')"
```

### 1. Create or reuse the GitHub Workload Identity Pool

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
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/urai-github/attribute.repository_id/1150887894"
```

### 5. Grant only the permissions required by the existing verification lane

The lane needs to inspect App Hosting, grant the App Hosting backend access to the existing `REPLICATE_API_TOKEN` secret, inspect secret metadata, and create a fresh App Hosting rollout. Use the narrowest roles that satisfy those exact operations in the current Firebase/Google Cloud project.

Before broad project-level grants, inspect whether the required access can be granted directly on the existing Secret Manager secret and App Hosting resources. Retain an IAM receipt showing every granted role and resource scope.

At minimum, the operator must prove that the service account can successfully execute the exact existing workflow commands:

```text
firebase apphosting:backends:get assetfactory-studio
firebase apphosting:secrets:grantaccess REPLICATE_API_TOKEN --backend assetfactory-studio
firebase apphosting:secrets:describe REPLICATE_API_TOKEN
firebase apphosting:rollouts:create assetfactory-studio --git_commit <EXACT_SHA>
```

Do not guess or add broad Owner/Editor roles merely to make the smoke pass.

## Values to return to GitHub

```bash
GCP_WIF_PROVIDER="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/urai-github/providers/asset-factory-github"
GCP_DEPLOY_SERVICE_ACCOUNT='asset-factory-deploy@urai-4dc1d.iam.gserviceaccount.com'
```

Configure those exact non-secret values in the protected GitHub environment used by `LifeLoggerAI/asset-factory`:

```text
Environment: asset-factory-production
Variable: GCP_WIF_PROVIDER
Value: projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/urai-github/providers/asset-factory-github

Variable: GCP_DEPLOY_SERVICE_ACCOUNT
Value: asset-factory-deploy@urai-4dc1d.iam.gserviceaccount.com
```

The provider value must contain the numeric Google Cloud project number and the full `/providers/asset-factory-github` suffix, not merely the pool name.

## Verification sequence

After IAM changes, allow for propagation before treating an immediate authentication failure as definitive.

1. Re-run the failed Replicate App Hosting verification workflow.
2. Confirm GitHub OIDC exchanges successfully and the active Google identity is the dedicated Asset Factory service account.
3. Confirm App Hosting backend `assetfactory-studio` can read `REPLICATE_API_TOKEN` without printing the value.
4. Confirm a fresh rollout completes.
5. Confirm the live public manifest reports only the sanitized readiness booleans as true.
6. Allow the already-installed single-use model3d smoke to execute once.
7. Retain the prediction ID, model/version, GLB hash/size, validation result, and cost receipt.
8. Do not mark Replicate complete until both the protected verification and the one-time GLB smoke pass.

## Completion evidence

Record all of the following in Asset Factory issue #63 and URAI Launch Control:

- WIF provider full resource name (non-secret)
- service-account email (non-secret)
- exact GitHub workflow run URL
- exact commit SHA
- successful OIDC/WIF authentication proof
- secret-read readiness result without secret disclosure
- rollout result
- one-time Replicate prediction ID and bounded cost
- GLB validation/hash/size
- confirmation that no service-account JSON key exists for this lane
