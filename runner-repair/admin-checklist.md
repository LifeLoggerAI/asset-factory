# Actions administrator checklist

- [ ] Confirm the signed-in account is an organization owner or billing manager.
- [ ] Open organization **Billing and licensing > Actions**; record included minutes, paid usage, spending limit, payment status, and any usage block.
- [ ] Open organization **Actions > General**; confirm Actions are enabled for `asset-factory` and `urai-spatial` and required official actions are allowed.
- [ ] Check enterprise Actions policy for overrides.
- [ ] Check GitHub Status for Actions or hosted-runner incidents.
- [ ] Inspect queued job `29142802902` and Spatial job `29142988159`; record `labels`, `runner_id`, `runner_name`, `status`, and timestamps.
- [ ] Do not disable branch protection, required checks, paid-generation environments, or production environments to clear the queue.
- [ ] After remediation, rerun one ordinary CI job before any paid-generation job.
- [ ] Verify the smoke job obtains a runner, completes, and uploads an artifact.
- [ ] Then allow the exact-head audit; only after it passes should the bounded paid workflow proceed.
