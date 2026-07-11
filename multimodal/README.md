# URAI Full Multimodal Asset Completion Program

This directory defines the fail-closed control plane for URAI's multimodal asset inventory, provenance, lifecycle, rights, validation, review, promotion, deployment, rollback, and live-verification evidence.

## Current boundary

- The control plane describes and validates required assets; it does not certify missing outputs.
- Normal pull-request audits must authorize zero provider calls and zero spend.
- Paid generation requires a separate exact-main authorization and is not granted by these files.
- Rights, consent, likeness, exact-hash human review, promotion, deployment, rollback, and live verification remain independent gates.
- One prior bounded provider smoke generated `home_threshold_main`; that receipt does not certify the remaining inventory.

No document in this directory is itself a production-complete claim.
