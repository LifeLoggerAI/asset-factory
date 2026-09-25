# URAI Asset Factory Unified Lock Receipt — 2026-09-25

This receipt exists to preserve the governed dependency-lock repair while restoring a repository-owner-authored exact head for PR #284 verification.

- Unified PR: #284
- Unified branch: `converge/asset-factory-production-multimodal-20260925`
- Production-hardening parent: PR #281 at `a9b3a2ef01d099d5d73448ff91c5fcc1821d9384`
- Last human-authored security head before lock regeneration: `a4f3f3f4bef45d320eb11d436583d247e1e8ec81`
- Governed lock regeneration commit: `89045e22728e8f8504fdf016f0112374a9cbf916`
- Lock regeneration changed only `pnpm-lock.yaml`.
- Lock regeneration actor: `github-actions[bot]`.
- Current reconciled Spatial PR: #1296
- Current reconciled Spatial exact head: `28cdf3354720e32b26fe94799810f5afb4098181`

The bot-authored lock commit is retained. This receipt does not bypass, replace, or transfer CI proof. Its purpose is to make the successor head human-authored so the repository's pull-request workflows can execute normally instead of terminating as zero-job `action_required` runs on the bot-authored synchronize event.

Provider spend remains disabled. No provider credential, production deployment, asset promotion, self-approval, or production-lock claim is authorized by this receipt.
