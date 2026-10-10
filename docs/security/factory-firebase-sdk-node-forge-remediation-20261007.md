# Factory Firebase SDK node-forge remediation receipt — 2026-10-07

This receipt is scoped to the isolated Asset Factory #430 donor. It is not a production, merge, art-admission, or Golden Master approval.

## Authority

- Parent: Asset Factory #421 `0a6e58b5b5b319efb1af27d8a69a20012f3e8d08`
- Donor branch: `repair/factory-firebase-admin13-node-forge-20261007`
- Proven pre-lock source: `b057b2d2db96d38a4d8fd7fdfeaeaa0c5f069512`
- Generated-lock commit: `fa08da96900962dcb5cbb02e6cc9ebc1fa632601`
- Proof workflow run: `37637450209`
- Proof job: `112847282989`

## Remediation

Governed Firebase SDK importers move to:
- `firebase-admin@13.10.0`
- `firebase-functions@6.6.0`
- `firebase-functions-test@3.4.1` where the legacy test importer requires it.

The Life Map pipeline explicitly imports `firebase-functions/v1` because it intentionally uses v1 Firestore trigger and EventContext semantics.

## Exact generated lock evidence

The successful proof workflow regenerated both lock graphs, verified that `node-forge` was absent, installed the regenerated frozen graphs, built/tested both Firebase Functions packages, and committed the proven lock candidates.

Retained artifact:
- artifact id: `11489623018`
- archive digest: `sha256:ad27cc46114ac9737ae816ccaf9c093ed996a3ce6f0b32c788c1d5c3fe7f2000`
- `pnpm-lock.yaml`: `sha256:2c0d6ff87c627212dbbf8c1319e12fc4bbee6bcc18abb434dd6333ab2b6a427e`
- `life-map-pipeline/functions/package-lock.json`: `sha256:77765b828d8e39b99953808508ea610786ae084d0cce8fd50f955f87eee31676`

The proof's `Prove node-forge leaves governed lock graphs` step passed. This closes only the node-forge path after the successor exact-head matrix also passes.

The separate `braces@3.0.3` HIGH advisory remains fail-closed and is not waived by this receipt.
