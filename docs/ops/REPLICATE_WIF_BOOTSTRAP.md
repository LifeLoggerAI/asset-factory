# Replicate Google WIF bootstrap — Asset Factory

Status: historical Google identity bootstrap exists; current dedicated Asset Factory runtime binding remains provider/control-plane open.

Repository: `LifeLoggerAI/asset-factory`

## Current authority

Current provider/runtime workflows do not hard-code a Firebase/GCP project, WIF provider, or deploy service account. They consume protected `asset-factory-production` environment variables:

```text
ASSET_FACTORY_FIREBASE_PROJECT_ID
GCP_WIF_PROVIDER
GCP_DEPLOY_SERVICE_ACCOUNT
```

`ASSET_FACTORY_FIREBASE_PROJECT_ID` must identify the provider-proven dedicated Asset Factory project and must not be the shared consumer project `urai-4dc1d`.

The WIF provider and service account may live in a separate identity/control-plane project if Google IAM is intentionally configured that way; their location does not transfer runtime authority to that project.

## Historical bootstrap evidence — 2026-08-16

A WIF pool/provider and service account were previously established in Google project `urai-4dc1d`. That historical identity bootstrap remains evidence that short-lived GitHub OIDC exchange can work, but it is **not** current Asset Factory runtime/project authority.

The historical App Hosting expectation `assetfactory-studio` in `urai-4dc1d` was not found by the authenticated backend inventory on 2026-10-05. Do not create or rename a backend there merely to satisfy the old expectation.

## Security boundary

- Do not create, download, restore, or upload a service-account JSON key.
- Keep GitHub OIDC trust restricted to immutable repository/owner identity and governed workflow refs.
- Keep provider selectors dormant until credential readiness and spend authorization are separately proven.
- Do not treat successful WIF exchange as proof that the target runtime project/backend exists.

## Verification sequence

1. Provision or identify the dedicated Asset Factory Firebase/GCP project.
2. Provision or identify its App Hosting backend and Hosting authority.
3. Set the protected environment variables above to the provider-read-back values.
4. Ensure the WIF service account has only the required rights on that dedicated target.
5. Run `Grant Provider App Hosting Secret Access` on exact current `main`.
6. Verify exact project readback, backend inventory, secret metadata access, fresh rollout, and sanitized provider-readiness booleans.
7. Stop. The grant/verification lane must not make a paid provider call.
8. Only after separate explicit spend authorization may the bounded Replicate smoke execute.

## Completion evidence

Retain the exact target project, backend resource/location, WIF provider, service-account email, workflow run, source SHA, rollout, sanitized secret-readiness result, and confirmation that no long-lived key was used.
