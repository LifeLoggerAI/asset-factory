# Asset Factory Production Lock

STATUS: NOT LOCKED

This file is retained as historical evidence of a previously verified Firebase production **slice**. It is not authority for full Asset Factory V200 production readiness.

## Historical verified slice

The historical receipt recorded local verification, Firebase Functions deployment, and live smoke testing for Firebase project `urai-4dc1d` at `https://urai-4dc1d.web.app`. That evidence remains useful for the specific routes and functions it actually exercised.

It does **not** establish the current full Asset Factory production lock.

## Current authoritative lock

The current completion authority is:

`docs/contracts/ASSET_FACTORY_COMPLETION_LOCK.md`

That lock remains **NOT LOCKED** until the current required evidence exists, including the complete governed promotion/provenance contract, current staging/production evidence, provider-backed generation where required, tenancy/isolation proof, billing/entitlement proof, worker/queue/retry/DLQ evidence, observability, custom-domain evidence where applicable, rollback evidence, and independent release authority.

No older report, local smoke, partial Firebase deploy, demo proof, or roadmap note may override the current completion lock.

## Provenance

The historical production-slice evidence and its receipts are preserved in repository history and the documented verification report. This reconciliation does not delete or rewrite that historical evidence; it removes the ambiguous implication that the historical slice is equivalent to the current full production lock.

## Boundary

Source implementation, historical deployment evidence, and current completion-lock authority are separate evidence classes. A historical deployed SHA must not be represented as the current release SHA unless an exact current deployment receipt proves that identity.
