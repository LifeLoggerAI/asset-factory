# Production Repo Audit Rules

Use this checklist with `docs/ASSET_FACTORY_IMPLEMENTATION_AUDIT_PROMPT.md` when running an AI-assisted implementation pass on Asset Factory.

## Purpose

The goal of an audit pass is not to create a long report. The goal is to make the repository measurably safer, clearer, and closer to launch readiness while preserving existing behavior.

## Required behavior

- Inspect actual repository files before making claims.
- Treat `LAUNCH_READINESS.md` as the launch source of truth.
- Keep production-lock language blocked until live evidence proves every required gate.
- Prefer small, reversible changes over broad rewrites.
- Continue with safe unblocked work when external resources are unavailable.
- Use existing package managers, scripts, tests, and validation gates.
- Do not claim validation passed unless the command actually completed successfully.
- Clearly separate pre-existing failures from failures caused by the current change.
- Preserve architecture, package boundaries, route contracts, naming conventions, and existing test style.
- Avoid speculative features that are not supported by the current repository.

## First safe task order

When no specific failing test or issue is supplied, choose the first safe item from this order:

1. Fix a validation blocker that prevents install, build, typecheck, lint, tests, or launch-readiness checks.
2. Add or tighten static validation for launch-readiness docs, required files, release evidence, or prompt contracts.
3. Improve operational docs that reduce deployment or audit ambiguity.
4. Add tests around existing completion-lock, launch-readiness, or release-evidence scripts.
5. Improve evidence templates or runbook references without changing runtime behavior.
6. Only change runtime behavior when a failing check, security issue, or explicit product requirement points to the exact gap.

## Completion report requirements

Every pass must report:

- files inspected;
- files changed;
- why each file changed;
- validation commands run;
- validation results;
- unresolved blockers;
- remaining production-readiness risks;
- next safest implementation task.
