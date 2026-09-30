# Replicate Google WIF bootstrap — Asset Factory

Status: historical `urai-4dc1d` bootstrap retained for forensic evidence only; final production verification must use the protected dedicated Asset Factory target.

Repository: `LifeLoggerAI/asset-factory`
Repository numeric ID: `1150887894`
Repository owner numeric ID: `215797546`
App Hosting backend: `assetfactory-studio`
Region: `us-central1`

## Current final-production identity contract

The protected GitHub environment `asset-factory-production` is the authority for:

```text
ASSET_FACTORY_FIREBASE_PROJECT_ID=<provider-generated dedicated Asset Factory project>
GCP_WIF_PROVIDER=<full dedicated Workload Identity Provider resource name>
GCP_DEPLOY_SERVICE_ACCOUNT=<least-privilege dedicated Asset Factory deploy service account>
```

Final production verification must fail closed when these values are absent. The historical shared project `urai-4dc1d`, historical project number `952723774155`, historical WIF provider under that project, `asset-factory-deploy@urai-4dc1d.iam.gserviceaccount.com`, and `asset-factory-dev-id` are not valid final Asset Factory production targets.

The repository's Production Readiness, protected Replicate secret-access verification, and bounded Replicate smoke must all consume the same protected dedicated-target identity instead of pinning a historical project in source.

## Historical Google Cloud state — 2026-08-16

The following state was verified for the earlier shared-project lane and remains useful forensic evidence only:

- Workload Identity Pool `urai-github-prod`: `ACTIVE`.
- Provider `asset-factory-github`: created and `ACTIVE`.
- Service account `asset-factory-deploy@urai-4dc1d.iam.gserviceaccount.com`: created.
- Immutable GitHub repository owner/repository ID restrictions were used.
- No service-account JSON key was created for that lane.

None of those historical identities certify the final dedicated Asset Factory production target. Do not copy them into the protected environment merely to make a workflow pass.

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
2. Confirm GitHub OIDC exchanges successfully through the protected `GCP_WIF_PROVIDER`.
3. Confirm the active Google identity is the protected `GCP_DEPLOY_SERVICE_ACCOUNT`, and that neither value belongs to the historical `urai-4dc1d` authority.
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
- dedicated provider-generated project ID and project number
- exact GitHub workflow run URL
- exact commit SHA
- successful OIDC/WIF authentication proof
- secret-read readiness result without secret disclosure
- rollout result
- separately authorized one-time Replicate prediction ID and bounded cost
- GLB validation/hash/size
- confirmation that no service-account JSON key exists for this lane
