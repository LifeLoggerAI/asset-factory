# Audit Triage Report

Status: **PARTIALLY REMEDIATED**

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

Latest hardening branch output confirmed:

- `npm --prefix life-map-pipeline/functions audit fix` added 4 packages, changed 10 packages, and reduced the audit surface.
- `npm run verify:local` passed.
- `npm run deploy:functions` passed.
- `npm run deploy:verify` passed against `https://urai-4dc1d.web.app`.
- Smoke evidence from latest run:
  - `assetId=2BRMKU6qSMxSfeHh71BE`
  - `queueId=ZxiJ5Nvjw99SEy5eVtmG`
  - `eventId=JFGTiGZURXsiqp36pmg2`
- `firebase-functions@5.1.1` is installed.
- `firebase-admin@12.7.0` is installed.
- `npm run deploy:verify-custom-domain` fails with `fetch failed`, meaning `assetfactory.app` is not ready yet.
- Root audit previously failed because no root `package-lock.json` was committed. `audit:root` now handles that state cleanly.

Functions audit was reduced from:

- 14 total findings
- 10 low
- 2 high
- 2 critical

To:

- 9 low findings
- 0 high findings observed in latest output
- 0 critical findings observed in latest output

## Current Remaining Finding Family

| Package / advisory | Severity | Area | Runtime reachable? | Fix path | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `@tootallnate/once <3.0.1` via `http-proxy-agent` / `teeny-request` / Google Cloud packages | Low | `life-map-pipeline/functions` transitive dependency | Likely Google Cloud/Firebase Admin transitive path; verify | Do **not** use `npm audit fix --force` directly on `main` | Open | Audit suggests forced remediation would install `firebase-admin@10.3.0`, a breaking downgrade from verified `firebase-admin@12.7.0`; leave as tracked low risk unless a safe upstream fix is available. |
| Root audit | Unknown | root | Unknown | Commit root lockfile or leave documented skip | Open | Root audit requires `package-lock.json`; `audit:root` now prints a skip message instead of failing noisily. |

## Remediated / No Longer Observed In Latest Output

| Package / advisory | Previous severity | Status | Notes |
| --- | --- | --- | --- |
| `fast-xml-parser <=5.6.0` | Critical | No longer observed after branch audit fix | Verify in committed lockfile diff before closing. |
| `protobufjs <7.5.5` | Critical | No longer observed after branch audit fix | Verify in committed lockfile diff before closing. |
| `node-forge <=1.3.3` | High | No longer observed after branch audit fix | Verify in committed lockfile diff before closing. |
| `path-to-regexp <0.1.13` | High | No longer observed after branch audit fix | Verify in committed lockfile diff before closing. |
| `qs 6.7.0 - 6.14.1` | Low / advisory-listed | No longer observed after branch audit fix | Verify in committed lockfile diff before closing. |

## Triage Rules

1. Do not run `npm audit fix --force` directly on `main`.
2. Prefer patch/minor upgrades first.
3. Confirm `npm run verify:local` after every dependency change.
4. Confirm `npm run deploy:verify` after any deploy-functions dependency change.
5. Only switch Firebase predeploy back to `npm ci` after `life-map-pipeline/functions/package-lock.json` is refreshed and deploy-tested.

## Recommended Next Branch Workflow

From the hardening branch that produced the successful output:

```bash
git status --short
git diff -- life-map-pipeline/functions/package-lock.json life-map-pipeline/functions/package.json
npm run verify:local
npm run deploy:functions
npm run deploy:verify
```

If the diff only contains the expected deploy-functions dependency/lockfile changes, open and merge a PR into `main`.

## Acceptance Criteria

- Audit findings are classified.
- Remaining low findings have documented accepted-risk or upstream dependency plan.
- Lockfile refresh/audit-fix diff is committed through PR if safe.
- `npm run verify:local` passes.
- `npm run deploy:verify` passes against `https://urai-4dc1d.web.app`.
