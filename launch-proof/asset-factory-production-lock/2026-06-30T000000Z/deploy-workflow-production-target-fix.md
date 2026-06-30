# Deploy Workflow Production Target Fix

Timestamp: 2026-06-30T02:35:00-05:00

## Finding

The manual Deploy Asset Factory workflow was still targeting the custom-domain production API base for production smoke. The repo documentation and historical evidence identify the Firebase default API base as the verified production smoke target while the custom-domain API routing blocker remains open.

## Fix

Updated `.github/workflows/deploy-asset-factory.yml` so production smoke resolves to the verified Firebase API base. Staging smoke remains pointed at the staging domain.

Updated `scripts/check-deploy-workflow.mjs` so the static deploy-workflow guard requires the Firebase production smoke base.

## Commits

- Workflow target fix: `51fc4fc68e140ba7f30bcb9454ce6e56a54c9e1b`
- Static checker alignment: `94fcf1128b4333e5b8fe55b5c096b355e55d6dc9`

## Status

Repo-side deploy targeting is now aligned with the documented production-smoke truth. Live deployment and authenticated smoke still require GitHub Actions workflow dispatch and environment secrets.
