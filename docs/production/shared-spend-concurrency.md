# Canonical shared-account concurrency

Factory owner #421 at `894bcbe5d052589fdcfbcb3144678d060535b53e` already integrates the actual IMAGE, Model Forge and Studio consumers with the canonical protected gateway, scoped credentials, pricing, absolute admission windows and independent charge reconciliation. This donor repairs that gateway rather than adding a second executor. Owner/main branches and the retained alternative #441 are unchanged.

The original actual account transaction checked shared cash and credit exposure but ignored concurrency. With ample funds and a genuinely signed synthetic concurrency cap of one, thirty distinct IMAGE/Forge/Studio-labeled jobs all reserved. `scripts/test-shared-spend-concurrency.mjs` reproduces that failure against the original source and verifies one admitted reservation against this repair. These are local serialized transactions with synthetic keys/records, not real Firestore contention, provider identity or financial authority.

## One account policy

The account key remains SHA-256 of `provider + "\n" + account_id`. All consumers of that canonical provider/API account must use the same protected `assetFactorySpendAccounts` document. Provider/account identity, credential mapping, fresh account balance, deployed controls and exact request proofs remain required under the existing gateway contract.

| Record | Mandatory field | Constraint |
| --- | --- | --- |
| Protected account | `max_concurrency` | Safe integer from 1 through 20 |
| Exact job budget | `max_concurrency` | Equals the canonical account cap; covered by the signed job digest |
| Genuine bounded approval | `max_concurrency` | Explicitly equals the exact job/account cap |
| Current protected controls | `max_concurrency` | Equals the same cap; covered by the independent control proof for scoped v2 workers |
| Protected account | `frozen` | Literal boolean; only `false` admits spending |
| Shared reservation | `settled` | Optional literal boolean; missing or `false` is an active hold |

Missing legacy caps fail closed. Existing trusted records need deliberate custodial provisioning and new eligible approvals/control proof; a test fixture or offline Labs #229 receipt cannot supply that authority. The pinned offline checker remains unchanged and non-authorizing. No live records, credentials or providers are provisioned by this source donor.

The gateway adds the exact proposed hold inside the same account transaction, validates every reservation, then counts all rows whose `settled` is not literal `true`. It admits only when that account-wide count is at most the agreed cap. No caller-local semaphore, consumer label or separate job/run identity can bypass the shared count. All rows still consume cash and credits, including settled actual debits. Duplicate IDs, unknown reservation fields, unsafe/negative amounts and non-boolean settlement state reject before any writes. The typed account envelope is also checked before readback and independent reconciliation so corrupt accounting cannot be coerced into released holds.

Unknown provider outcomes retain their full cap and concurrency. Independent final signed charge receipts preserve the existing terminal/retry policy: terminal actual debits stop consuming a slot while continuing to consume the current cash/credit snapshot; the originally bounded corrective retry retains its hold. Actual overruns remain recorded and freeze the account. Real explicit account-balance reconciliation is still required to avoid double-counting a later provider snapshot.

## Verification and admission

The new actual-module suite exercises thirty concurrent different-consumer jobs at cap one, cap two with settled history, foreign unresolved holds, cash and credit accounting, unknown outcome, independent settlement, mismatched/missing/signed caps, strict flags, post-preflight policy changes and corrupt recovery. The retained gateway suite adds twenty-one independently signed scoped v2 workers racing one account. Actual Model Forge/gateway integration and existing IMAGE, Forge and Studio contract suites remain required. The no-credential native workflow checks the exact candidate and strict gateway types.

This source repair does not supply authentic approval, actual installed account/control/pricing records, independent signing-key custody, deployed immutable gateway/consumer identity, real dedicated Firestore/IAM contention proof, provider/proxy hard cash-credit-runtime stop/kill controls or a genuine final charge feed. Those remain exact protected activation prerequisites. Green source tests also do not waive the installed HIGH security gate, numerical/visual asset acceptance, device proof or release authority. No paid request, approval signing, billing change, owner/main mutation, deployment or release acceptance is performed.
