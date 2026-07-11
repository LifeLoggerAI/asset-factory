# GitHub Actions runner diagnosis

## Verified facts

- `LifeLoggerAI` is a GitHub **User** account, not an organization.
- Both repositories are public and the connected identity has repository admin permission.
- Workflows create runs and jobs successfully.
- Inspected jobs use ordinary `ubuntu-latest` labels.
- Jobs remain queued with no assigned runner, no steps, and no logs across both repositories.
- Unrelated workflows and repositories are affected, so repository concurrency and protected environments do not explain the full queue.
- Auto-merge is disabled in both repository settings.

## Control planes still requiring account-side inspection

1. Personal account **Settings > Billing and licensing > Actions**: payment status, usage limits, spending limits, or account restriction.
2. Repository **Settings > Actions > General**: Actions permissions and allowed actions.
3. GitHub-hosted runner service availability or an account-level Actions restriction.
4. GitHub Support, if billing and repository Actions settings are healthy while ordinary public-repository jobs remain unassigned.

## Repository-level conclusion

No safe code or workflow label change can allocate a GitHub-hosted runner. Weakening required checks, removing protected environments, or merging without receipts would conceal the fault rather than repair it.

## Administrator checks

```bash
gh api /user/settings/billing/actions
gh api /repos/LifeLoggerAI/asset-factory/actions/permissions
gh api /repos/LifeLoggerAI/urai-spatial/actions/permissions
gh api /repos/LifeLoggerAI/asset-factory/actions/runs/29143390905/jobs
gh api /repos/LifeLoggerAI/urai-spatial/actions/runs/29142988159/jobs
```

Some billing endpoints may require browser access or additional account scopes. A 403 means the token cannot inspect that control plane; it is not proof that billing or account status is healthy.

## Recovery verification

After correcting the account setting, rerun one ordinary CI job. Require an assigned runner, completed steps, a green conclusion, and an uploaded artifact before allowing paid generation. Then execute the exact-head audit, review generated assets, merge the promotion PR, and use the protected production workflow with distinct release and rollback SHAs.
