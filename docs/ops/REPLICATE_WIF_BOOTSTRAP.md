# Replicate Google WIF bootstrap — Asset Factory

Status: Google control-plane bootstrap completed 2026-08-16; GitHub verification pending.

Repository: `LifeLoggerAI/asset-factory`
Repository numeric ID: `1150887894`
Repository owner numeric ID: `215797546`
Google Cloud / Firebase project: `urai-4dc1d`
Google Cloud project number: `952723774155`
App Hosting backend: `assetfactory-studio`
Region: `us-central1`

## Active identity contract

```text
GCP_WIF_PROVIDER=projects/952723774155/locations/global/workloadIdentityPools/urai-github-prod/providers/asset-factory-github
GCP_DEPLOY_SERVICE_ACCOUNT=asset-factory-deploy@urai-4dc1d.iam.gserviceaccount.com
```

The dedicated provider is inside the existing production pool `urai-github-prod`. The existing `github-actions` provider in that pool remains dedicated to `LifeLoggerAI/urai-spatial` and must not be broadened.

## Verified Google Cloud state — 2026-08-16

- Workload Identity Pool `urai-github-prod`: `ACTIVE`.
- Dedicated provider `asset-factory-github`: created and `ACTIVE`.
- Dedicated service account `asset-factory-deploy@urai-4dc1d.iam.gserviceaccount.com`: created.
- `roles/iam.workloadIdentityUser` binding grants only repository numeric ID `1150887894` through the `urai-github-prod` pool.
- Provider trust is restricted to owner numeric ID `215797546`, repository numeric ID `1150887894`, branch `refs/heads/main`, and the two governed Asset Factory workflow refs.
- The service account has App Hosting deploy rights required by the verification lane.
- `roles/secretmanager.admin` is scoped to the existing `REPLICATE_API_TOKEN` secret for the dedicated service account.
- No service-account JSON key was created for this lane.

## Security boundary

Do not create, download, restore, or upload a service-account JSON key for this workflow.

GitHub uses a shared OIDC issuer, so the provider condition must remain restricted to immutable GitHub numeric IDs and the governed workflow refs. Do not broaden the existing `github-actions` provider used by `urai-spatial`.

The Asset Factory provider condition is intentionally restricted to:

```text
attribute.repository_owner_id == '215797546'
attribute.repository_id == '1150887894'
attribute.ref == 'refs/heads/main'
workflow_ref is either:
  LifeLoggerAI/asset-factory/.github/workflows/grant-replicate-apphosting-secret.yml@refs/heads/main
  LifeLoggerAI/asset-factory/.github/workflows/replicate-bounded-model3d-smoke.yml@refs/heads/main
```

## Verification sequence

1. Run `Grant Replicate App Hosting Secret Access` on exact current `main`.
2. Confirm GitHub OIDC exchanges successfully through `urai-github-prod/providers/asset-factory-github`.
3. Confirm the active Google identity is `asset-factory-deploy@urai-4dc1d.iam.gserviceaccount.com`.
4. Confirm App Hosting backend `assetfactory-studio` can access `REPLICATE_API_TOKEN` without printing the secret value.
5. Confirm a fresh App Hosting rollout completes.
6. Confirm the public manifest reports only sanitized Replicate readiness booleans as true.
7. Stop. The no-spend verification must not trigger a paid Replicate prediction.
8. Only after separate explicit spend authorization, manually dispatch `Replicate Bounded Model3D Smoke` from `main` with `RUN_ONE_REPLICATE_MODEL3D_SMOKE`.
9. The smoke must refuse a second paid prediction if issue #63 already contains a completion marker.

## Completion evidence

Record in Asset Factory issue #63 and URAI Launch Control:

- provider resource name
- service-account email
- Google project number `952723774155`
- exact GitHub workflow run URL
- exact commit SHA
- successful OIDC/WIF authentication proof
- secret-read readiness result without secret disclosure
- rollout result
- separately authorized one-time Replicate prediction ID and bounded cost
- GLB validation/hash/size
- confirmation that no service-account JSON key exists for this lane
