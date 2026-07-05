# Genesis Boundary Public Copy Lock - 2026-07-05

Status: `ACTIVE_UNTIL_PRODUCTION_LOCK`

This file keeps public claims aligned with the URAI Genesis product boundary while Asset Factory, Spatial handoff, and system-of-systems production gates remain evidence-gated.

## Purpose

Keep public copy inside this boundary:

- private
- permissioned
- explainable
- correctable
- hideable
- deletable
- consent-based
- user-controlled
- rollback-aware
- production-gated

This applies to website copy, README copy, launch notes, investor and foundation summaries, product pages, docs, and pitch materials.

## Allowed public framing

Use language like:

```text
URAI is a private, permissioned life operating system that turns user-approved life signals into an explainable, correctable, hideable, and deletable living interface.
```

```text
Asset Factory is the production-gated generation pipeline for URAI assets and handoffs. Provider-backed output is certified only when exact receipts and quality evidence are attached.
```

```text
Spatial experiences use canonical version gates. Fallback assets may support safe previews, but provider readiness requires exact handoff receipts.
```

```text
URAI autonomous actions are consent-based and logged. External actions require user approval or explicit user-defined rules.
```

## Forbidden public framing until substantiated

Do not claim:

- clinical diagnosis or treatment
- replacement for licensed professional services
- surveillance by default
- hidden third-party sharing
- hidden job applications
- autonomous external actions without consent or explicit rules
- guaranteed outcomes
- fully production ready
- 100% complete
- system-of-systems complete
- all versions provider-certified
- V2, V3, or V4 provider-ready without exact receipts

## Required qualifiers while lock is open

Use:

```text
production-gated
```

```text
evidence-backed where receipts are attached
```

```text
provider certification pending exact receipt
```

```text
screenshot-derived signal until native platform exports are attached
```

```text
feature-flagged dependency until Asset Factory lock is closed
```

## Native signal export rule

Signal metrics may be used only with source-level confidence:

- Screenshot-derived metrics must be labeled screenshot-derived.
- Native platform exports must be attached before claiming verified platform analytics.
- Candidate accounts, unverified screenshots, and estimated counts must stay separated from confirmed exports.
- Every public metric needs a date, source, confidence level, and evidence link.

## Dependency rule

UrAi, UrAiProd, Spatial, Studio, Jobs, Foundation, Investors, Marketing, and Content should not use stronger claims than the lock state allows.

If Asset Factory is `NOT LOCKED`, consumers must say:

```text
Asset Factory repo-side hardening is complete for the current pass, with evidence-gated production lock pending live staging/production auth, tenancy, provider, worker, billing, observability, website, rollback, and production smoke evidence.
```

## Release transition

When Asset Factory becomes `LOCKED`, update this file in the same PR that includes:

1. Release evidence with all P0 gates passed.
2. Issue #63 closure evidence.
3. Provider receipts for any certified asset versions.
4. UrAi or UrAiProd dependency update.
5. Public copy audit proving no overclaim remains.
