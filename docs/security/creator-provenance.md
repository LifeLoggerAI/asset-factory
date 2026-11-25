# Creator provenance for new Studio jobs

The Generate and Jobs POST handlers bind `creatorProvenance` after the existing
JWT authorization and asynchronous quota recheck. Client owner/user/subject and
provenance fields cannot provide this attribution. Disabled or legacy-header
development authentication records an explicit unknown state.

The v1 record identifies the authenticated creator and tenant. It does not
identify every person depicted in content, establish sole ownership of a shared
tenant asset, or authorize consumer deletion. `subjectResolution` stays unknown
and `consumerDeletionEligible` stays false. JWT issuer/account custody and the
existing authentication limitations remain separate deployment requirements.

Firestore creates job and queue atomically without replacing an existing job.
Updates preserve job/tenant identity and provenance; derived assets take creator
attribution from their stored parent job inside the same transaction. The local
development backend preserves the same identity checks. Local JSON persistence
is not a production concurrency or durability guarantee.

Historical records without creator provenance remain unattributed. Updates
cannot invent attribution, and no migration, backfill, subject linkage, deletion
worker or terminal deletion receipt is introduced. The dedicated pipeline and
Studio remain separate coverage domains for future reviewed deletion work.

Validation commands:

```sh
node --test scripts/test-factory-web-auth-runtime.mjs
node --experimental-vm-modules --test scripts/test-asset-creator-provenance.mjs
npm --prefix assetfactory-studio run typecheck
```

The backend suite executes actual modules against a synthetic transactional
store; it does not certify a deployed Firestore service or live asset lifecycle.
