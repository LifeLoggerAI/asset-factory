# Actions recovery checklist

- [ ] Open personal account **Settings > Billing and licensing > Actions**.
- [ ] Record payment status, included usage, paid usage, spending limit, and any account restriction.
- [ ] Open each repository **Settings > Actions > General**.
- [ ] Confirm Actions are enabled and official actions such as `actions/checkout`, `actions/setup-python`, `actions/setup-node`, and `actions/upload-artifact` are allowed.
- [ ] Check GitHub Status for an Actions or hosted-runner incident.
- [ ] Inspect Asset Factory run `29143390905` and Spatial run `29142988159`; record status, labels, runner ID/name, timestamps, steps, and logs.
- [ ] Do not remove required checks or protected paid/deployment environments.
- [ ] After remediation, rerun one ordinary CI job before any paid workflow.
- [ ] Require runner assignment, completed steps, green conclusion, and uploaded evidence.
- [ ] Run the exact-head multimodal audit.
- [ ] Execute bounded generation only after audit success and credential preflight.
- [ ] Complete human creative review and rights review.
- [ ] Merge Asset Factory and the generated Spatial promotion PR only after required checks pass.
- [ ] Deploy Spatial through the protected production workflow with exact release and distinct ancestor rollback SHAs.
- [ ] Verify `/release-fingerprint.json`, live route parity, query preservation, and deployment artifacts.
- [ ] Execute the physical Quest test packet and attach device receipts.
- [ ] Accept `receipts/completion-receipt.json` only when every gate is true.
