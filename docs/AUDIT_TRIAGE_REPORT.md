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

The production deploy logs reported:

- 14 total Functions dependency audit findings
- 10 low
- 2 high
- 2 critical

These findings require classification before automated remediation.

## Classification Table

| Package / advisory | Severity | Area | Runtime reachable? | Fix path | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| TBD | TBD | root / functions / engine / legacy functions | TBD | patch / minor / major / accepted risk | Open | Fill after `npm run audit:all` output |

## Triage Rules

1. Do not run `npm audit fix --force` directly on `main`.
2. Prefer patch/minor upgrades first.
3. Confirm `npm run verify:local` after every dependency change.
4. Confirm `npm run deploy:verify` after any deploy-functions dependency change.
5. Only switch Firebase predeploy back to `npm ci` after `life-map-pipeline/functions/package-lock.json` is refreshed and deploy-tested.

## Acceptance Criteria

- Audit findings are classified.
- Runtime-reachable high/critical findings have a patch plan or documented accepted-risk decision.
- Lockfile refresh is committed if needed.
- `npm run verify:local` passes.
- `npm run deploy:verify` passes against `https://urai-4dc1d.web.app`.
