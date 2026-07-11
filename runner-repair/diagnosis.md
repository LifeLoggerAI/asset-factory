# GitHub Actions runner diagnosis

## Verified repository facts

- Workflows create runs and jobs in both `LifeLoggerAI/asset-factory` and `LifeLoggerAI/urai-spatial`.
- All inspected jobs use ordinary `ubuntu-latest`; no unavailable custom label is required.
- Multiple unrelated workflows across two repositories remain queued without a runner assignment.
- Repository admin access is available, but organization billing, quota, Actions policy, enterprise policy, and hosted-runner controls are not exposed by the connected repository API.
- Concurrency groups cannot explain every queued run because unrelated groups and repositories are affected.
- Environment approvals may delay protected paid/deploy jobs, but cannot explain ordinary CI and audit jobs also remaining queued.

## Most likely control planes

1. Organization **Settings > Billing and licensing > Actions**: spending limit, exhausted included minutes, payment failure, or disabled paid usage.
2. Organization **Settings > Actions > General**: Actions disabled or restricted to selected repositories/actions.
3. Enterprise **Policies > Actions**: enterprise override or hosted-runner restriction.
4. Organization **Settings > Actions > Runner groups**: repository access policy, relevant only if workflows are rewritten to custom runners.
5. GitHub Status / hosted-runner service incident.

## Repository-level fixes checked

No safe repository edit can allocate a GitHub-hosted runner. Workflows already use supported labels and have created jobs successfully. Changing labels, weakening environments, cancelling required checks, or merging without receipts would hide rather than repair the fault.

## Administrator evidence commands

```bash
gh api /orgs/LifeLoggerAI/settings/billing/actions
gh api /orgs/LifeLoggerAI/actions/permissions
gh api /orgs/LifeLoggerAI/actions/runner-groups
gh api /repos/LifeLoggerAI/asset-factory/actions/runs/29142802902/jobs
gh api /repos/LifeLoggerAI/urai-spatial/actions/runs/29142988159/jobs
```

Some endpoints require organization-owner or billing-manager scope. A 403 is evidence that the current token lacks the required organization authority, not that the setting is healthy.

## Decision branches

- **Billing/quota exhausted:** restore payment or raise the Actions spending limit; rerun one small CI job.
- **Actions disabled/restricted:** allow GitHub Actions and the required official actions for both repositories.
- **Enterprise override:** enterprise owner must change the controlling policy.
- **GitHub incident:** retain queued runs and verify after the service incident resolves.
- **Hosted runners intentionally unavailable:** attach an approved self-hosted runner group, then change only a smoke workflow first and verify isolation/security before broad migration.
