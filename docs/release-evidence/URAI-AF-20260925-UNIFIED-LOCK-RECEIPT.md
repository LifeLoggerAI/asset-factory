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


## Governed active-lock regeneration — 2026-09-25 06:14Z

- Manifest-alignment commit before regeneration: `beff26f2bfd07ad10a18912a8d5b0897bf29476c`
- Governed repair workflow fix: `0b2895f6c2b616e2c40ba411e6bd3e2b44c515f8`
- Generated lock commit: `cee77b4445328f24022ff6eb1274b1f9f4e373a9`
- Generated lock commit actor: `github-actions[bot]`
- Files changed by generated lock commit:
  - `pnpm-lock.yaml`
  - `life-map-pipeline/functions/package-lock.json`
- Engine shrinkwrap was already coherent and did not change.
- The governed workflow regenerated locks, verified active lock roots against package manifests, and committed only generated lock outputs.

This receipt preserves the generated locks while restoring a repository-owner-authored exact head for subsequent pull-request verification. It does not substitute for the dependency audit or transfer any prior green result.
