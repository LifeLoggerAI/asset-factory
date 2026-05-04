# URAI Asset Factory

URAI Asset Factory is the canonical asset-generation layer for the URAI ecosystem and the public product planned for `www.uraiassetfactory.com`.

It generates, packages, versions, traces, and exports symbolic UI assets, sky layers, mood/weather overlays, aura blobs, silhouettes, constellation/starfield assets, memory bloom assets, scroll frames, replay/video assets, ritual cards, glyphs, badges, timeline visuals, cinematic scene packs, brand kits, and downstream URAI integration bundles.

## Canonical architecture

See `docs/adr/0001-canonical-asset-factory-architecture.md` for the accepted architecture decision.

Production source of truth:

- `assetfactory-studio/`: public website, authenticated dashboard, asset generator, library, export hub, and operator console.
- `functions/`: canonical Firebase backend for jobs, billing, usage ledger, asset registry, export issuance, audit logs, and operational automation.
- `life-map-pipeline/functions/`: LifeMap ingestion adapter only.
- `replay-engine/`: replay/video adapter that registers outputs back into the asset registry.
- `engine/` and `apps/web/`: non-canonical/legacy unless a later ADR promotes them.

## Requirements

- Node.js 20.x or newer.
- npm 10+.
- Firebase CLI for emulators and deploys.
- Firebase project with Auth, Firestore, Storage, Functions, and Hosting enabled.
- Stripe secrets for billing flows when running production or staging billing tests.

## Install

```bash
npm install
npm --prefix functions install
npm --prefix life-map-pipeline/functions install
npm --prefix assetfactory-studio install
```

## Verify

```bash
npm run verify
```

`npm run verify` runs runtime/documentation guards, package checks, backend checks, and build checks. CI must pass this before production deploy.

## Run locally

### Canonical Firebase backend emulator

```bash
npm --prefix functions run serve
```

### Studio app

```bash
npm --prefix assetfactory-studio run dev
```

### LifeMap ingestion adapter build

```bash
npm --prefix life-map-pipeline/functions run build
```

## Deploy

Deploy the canonical backend, Firestore rules/indexes, and Storage rules from the repository root or the `functions/` package scripts:

```bash
firebase deploy --only functions,firestore:rules,firestore:indexes,storage
```

Do not deploy production Functions from `life-map-pipeline/functions`; that package is an adapter, not the primary backend.

## Production acceptance gates

Production launch is blocked until all of the following are true:

1. `firebase.json`, root `package.json`, `functions/package.json`, and CI agree on Node 20+.
2. Firestore and Storage rules cover the canonical collections and storage paths.
3. Stripe webhook handling is idempotent and writes `webhooks`, `billingAudit`, `tenants`, and `usageLedger` consistently.
4. Asset downloads use short-lived signed URLs and audit every issuance.
5. Privacy, security, support, deletion/export, billing, onboarding, and domain setup pages are real and reviewed.
6. Emulator-backed tests validate job creation, processing, exports, billing gates, unauthenticated rejection, expired subscription rejection, retry/dead-job flows, and replay/LifeMap registration.
7. CI/CD blocks placeholder legal copy, unsupported production-lock claims, missing indexes, dependency drift, and runtime mismatch.

## Troubleshooting

- If runtime checks fail, align `firebase.json`, root `package.json`, `functions/package.json`, and CI to Node 20+.
- If packaging fails, verify `assetfactory-studio` has `jszip` installed because backend packaging imports the Studio packaging helper.
- If billing tests fail, confirm Stripe secrets and webhook secrets are configured in Firebase Functions config or environment variables.
- If Firebase deploy fails, confirm Firebase CLI authentication, selected project, and required APIs.
