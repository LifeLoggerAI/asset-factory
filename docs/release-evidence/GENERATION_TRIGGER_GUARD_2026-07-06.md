# Generation Trigger Guard — 2026-07-06

Status: `VERIFIED_IN_REPOSITORY`

Repository: `LifeLoggerAI/asset-factory`

Branch: `main`

## Commits

- `f224ae663c70562db38e17a02a85d49a36eda0ea`: pull requests and ordinary pushes now run image-contract validation only; optional local pack creation requires `BUILD_LOCAL_PACK` and forces offline mode.
- `4def99d881aba7d54f1cbf4ad7d639abe469b75f`: canonical V1–V5 manifest count/path verifier.
- `ae3f71180cb103d55c2a748667c21c01b70cf6ee`: final V1 avatar rendering now uses manual dispatch, `GENERATE_V1_AVATARS`, and the `paid-asset-generation` environment.
- `06939cc13a9f2e12c55f39ed95c0089778cda6ac`: V2 rendering now uses manual dispatch, `GENERATE_V2_80`, and the `paid-asset-generation` environment.
- `88f4ff0649f989641f957b09752a7635a2a5f387`: canonical version check added to `verify:local`.
- `aac1f171ced59b4fa04045043da9a9bbba8f0c12`: canonical asset/version contract documented.

## Verified source state

- `image-asset-generator.yml`: automated events validate only and do not reference provider secrets.
- `final-v1-avatar-extension.yml`: `workflow_dispatch` only with exact confirmation.
- `v2-living-state-forge.yml`: `workflow_dispatch` only with exact confirmation.

## Canonical counts

- V1: 53
- V2: 80
- V3: 14
- V4: 39
- V5: 27

Validation command:

```bash
npm run image:check:version-contract
```

## Boundaries

No provider call, deployment, or asset promotion was performed by these changes.

This receipt does not prove repository Environment reviewer settings. Configure `paid-asset-generation` with required reviewers and restricted secrets.

Other provider-capable workflows still require inventory and the same authorization rule.
