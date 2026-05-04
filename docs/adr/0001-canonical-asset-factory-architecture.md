# ADR 0001: Canonical Asset Factory Architecture

Date: 2026-05-04
Status: Accepted

## Context

Asset Factory had multiple overlapping runtimes and surfaces: `functions/`, `assetfactory-studio/`, `life-map-pipeline/functions/`, `replay-engine/`, `engine/`, and scaffolded/generated paths. The completion audit identified architectural drift, runtime mismatch, duplicated billing/job code, local Studio persistence, placeholder legal pages, and incomplete CI/CD enforcement.

## Decision

The canonical production architecture is:

1. `assetfactory-studio/` is the public product, authenticated dashboard, asset generator, library, export hub, and operator console for `www.uraiassetfactory.com`.
2. `functions/` is the only production Firebase backend for job lifecycle, entitlement checks, Stripe webhooks, usage ledger writes, reconciliation, audit logging, and signed download issuance.
3. `life-map-pipeline/functions/` is an adapter for structured LifeMap ingestion only. It must not be the primary deploy target.
4. `replay-engine/` is a downstream adapter for replay/video orchestration and must register outputs back into the asset registry.
5. `engine/`, `apps/web/`, and scaffold-only code are non-canonical unless explicitly promoted by a later ADR.
6. Firestore and Cloud Storage are the system of record for production jobs, assets, bundles, usage, billing audit, exports, dead jobs, and admin actions.
7. All production runtimes use Node 20 or newer.
8. CI must block runtime drift, placeholder legal/trust pages, unsupported production claims, missing indexes, and broken build/test commands.

## Consequences

- The README, Firebase config, rules, indexes, scripts, and CI workflows must all point to the same production path.
- Local JSON/file stores may remain for development only, but production builds must use Firebase-backed persistence.
- Billing must converge to one Stripe webhook handler, one entitlement model, one usage ledger, and one reconciliation job.
- Signed URLs must be short-lived and audited.
- Public launch is blocked until privacy, security, support, deletion/export, billing, and domain setup surfaces are no longer placeholders.
