# Audit Triage Report

Status: **OPEN**

This report tracks dependency audit findings after Asset Factory production verification. Production remains verified unless a live smoke regression occurs.

## Commands

```bash
npm run audit:all
```

For detailed package trees:

```bash
npm audit --json > root-audit.json
npm --prefix life-map-pipeline/functions audit --json > functions-audit.json
```

## Current Known Summary

Latest local hardening run confirmed:

- `npm run verify:local` passes.
- `npm run deploy:verify` passes against `https://urai-4dc1d.web.app`.
- `firebase-functions@5.1.1` is installed.
- `firebase-admin@12.7.0` is installed.
- `npm run deploy:verify-custom-domain` fails with `fetch failed`, meaning `assetfactory.app` is not ready yet.
- Root audit previously failed because no root `package-lock.json` was committed. `audit:root` now handles that state cleanly.

Functions audit currently reports:

- 14 total Functions dependency audit findings
- 10 low
- 2 high
- 2 critical

## Classification Table

| Package / advisory | Severity | Area | Runtime reachable? | Fix path | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `fast-xml-parser <=5.6.0` | Critical | `life-map-pipeline/functions` transitive dependency | Needs investigation | `npm audit fix` if non-breaking; otherwise dependency upgrade plan | Open | Multiple XML parser advisories, likely pulled through Firebase/Google Cloud tooling. |
| `protobufjs <7.5.5` | Critical | `life-map-pipeline/functions` transitive dependency | Needs investigation | `npm audit fix` if non-breaking; otherwise dependency upgrade plan | Open | Arbitrary code execution advisory; prioritize runtime reachability check. |
| `node-forge <=1.3.3` | High | `life-map-pipeline/functions` transitive dependency | Needs investigation | `npm audit fix` if non-breaking | Open | Certificate/signature verification advisories. |
| `path-to-regexp <0.1.13` | High | `life-map-pipeline/functions` transitive dependency | Needs investigation | `npm audit fix` if non-breaking | Open | ReDoS advisory; determine whether exposed in HTTPS Function request path. |
| `qs 6.7.0 - 6.14.1` | Low in summary, advisory listed by audit | `life-map-pipeline/functions` transitive dependency | Needs investigation | `npm audit fix` if non-breaking | Open | DoS via comma parsing. |
| `@tootallnate/once <3.0.1` via `http-proxy-agent` / `teeny-request` / Google Cloud packages | Low in summary, audit suggests breaking forced downgrade path | `life-map-pipeline/functions` transitive dependency | Likely deploy/admin SDK path; verify | Do **not** use `npm audit fix --force` without branch testing | Open | Audit suggests `firebase-admin@10.3.0`, which would be a breaking downgrade and is not acceptable directly on `main`. |
| Root audit | Unknown | root | Unknown | Commit root lockfile or leave documented skip | Open | Root audit requires `package-lock.json`; `audit:root` now prints a skip message instead of failing noisily. |

## Triage Rules

1. Do not run `npm audit fix --force` directly on `main`.
2. Prefer patch/minor upgrades first.
3. Confirm `npm run verify:local` after every dependency change.
4. Confirm `npm run deploy:verify` after any deploy-functions dependency change.
5. Only switch Firebase predeploy back to `npm ci` after `life-map-pipeline/functions/package-lock.json` is refreshed and deploy-tested.

## Recommended Next Branch Workflow

```bash
git checkout -b hardening/functions-audit-fixes
npm --prefix life-map-pipeline/functions audit fix
npm --prefix life-map-pipeline/functions run build
npm run verify:local
npm run deploy:verify
```

If `npm audit fix` changes deploy dependencies, run a Functions deploy and live smoke before merging:

```bash
npm run deploy:functions
npm run deploy:verify
```

## Acceptance Criteria

- Audit findings are classified.
- Runtime-reachable high/critical findings have a patch plan or documented accepted-risk decision.
- Lockfile refresh is committed if needed.
- `npm run verify:local` passes.
- `npm run deploy:verify` passes against `https://urai-4dc1d.web.app`.
