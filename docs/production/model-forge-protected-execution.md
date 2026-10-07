# Model Forge protected execution — source admission handoff

This donor repairs the actual Model Forge paid dispatch boundary on Factory #421 (`e0d1ff4967562684a866386662bcc01e7d8af4de`). It is a source and synthetic behavior result. It does not authenticate a real approval, establish provider access or balance, authorize spending, deploy, merge, or certify production operation.

## Existing authorities and non-colliding scope

The launch/source convergence owner is Factory #421, branch `repair/model-forge-current-main-20261007`. Factory #431 is the additive GLB-container donor (`a0bc132f7548d37af24efdd572407471972706d2` at readback); it is not spend authority. The Forge parser was preserved so the owner can deliberately admit container/numeric donors alongside the spend repair. The model inventory and older #284/#1296/Drive snapshots remain historical until renewed against current authority.

Labs #229 merged its offline spend checker as `6ee450551b6ed79c1016e7e40eb4411bb6eb36c0`, from `8d0268303b992a74b83ae523a22757f46d73adc1`. Its offline pass never authorizes a provider call. This donor preserves that distinction.

Factory #436 (`e4a4d6e50c64bd19709c7f2534c7115ad424e846` at readback) owns the Python image leaf and Studio `/api/worker/production-spend` gateway. None of its sixteen paths are changed here. Forge reuses its canonical provider/account reservation schema; it does not create another image gateway. The two existing Studio image/audio/3D and video adapter exports are contained here: local proof remains usable, while every configured paid adapter throws before transport until deliberately integrated through the existing protected owner. These wrappers are separate from #436's gateway paths.

## Admission and authenticated records

`forge.mjs` and `run-wave.mjs` require a protected execution deployment, one provider, one attempt and one pilot target. The old spend environment bit and a provider credential are insufficient. No auto retry of a charged create is permitted, including HTTP429, timeout, malformed/missing acknowledgement, process restart, new grant, or asset-label changes.

Deployment configuration supplies purpose-scoped Ed25519 **public** issuer keys, a dedicated Firebase project, immutable source SHA and approval identifier. No CLI-supplied approval file, private signing key, arbitrary JSON authority, local temporary ledger or shared `urai-4dc1d` project is accepted. The production loader uses Firebase Admin application-default credentials through the existing protected deployment boundary. Private signing keys and provider credentials must remain in their separate trusted services; they are neither created nor installed by this donor.

| Collection | Binding and behavior |
|---|---|
| `assetFactorySpendApprovals` | Exact signed request/source/executor/model/limits, project/account, fixed price ceiling receipt, rights/reuse/acceptance, owner/consumer, expected artifacts and exact artifact hosts. Kind `BOUNDED_MODEL_FORGE_SPEND`. |
| `assetFactoryModelForgeBalances` | Independent signed current API cash/credit snapshot, provider/project/account, actual token fingerprint and concurrency limit. Key `sha256(provider + "\n" + account_id)`. Kind `API_BALANCE`. |
| `assetFactoryModelForgeControls` | Independently purpose-signed `PROVIDER_CONTROLS` record at the exact request digest. Account/project/provider/request/executor/source binding, matching cash/credit caps, bounded remote runtime, tested provider/proxy proof, hard stop and cost enforcement, no auto top up. Its digest is bound by the signed approval. |
| `assetFactorySpendAccounts` | **Existing #436 shared account namespace**, same key. Provider/account/API identity, matching cash/credit/time snapshot, strict freeze boolean and shared `reservations` array. Forge reserves `job_id=model-forge-<permanent claim hash>` in this same document. |
| `assetFactorySpendLedgers` | Forge aggregate accounting cross-check at the same canonical account key, strict integer/freeze fields and original balance digest. It supplements the shared account and cannot replace it. |
| `assetFactorySpendClaims` | Permanent project/provider/model/actual-input identity, exact request and original signed snapshots, lease/deadline and operation markers. Never silently reset, expire, delete or recycle. |
| `assetFactorySpendReceipts` | Independent final native charge evidence for every acknowledged create, binding account/project/grant/request/task/outcome and actual cash/credits. Kind `PROVIDER_CHARGE`. |
| `assetFactoryConsumedSpendReceipts` | Globally consumed task receipt identity; one charge cannot settle another attempt. |

Every reserve, create-slot admission and settlement rereads its actual shared account in the same Firestore transaction as the Forge records. Other consumer holds, including settled debits, constrain both cash and credits. Settled debits no longer consume concurrency. Settlement replaces the original cap hold with the truthful actual debit using #436's contract; it stays held until an explicit governed account snapshot rollover accounts for it. This may temporarily overcount, but cannot reopen stale available cash. Both the shared account and Forge ledger freeze on an observed cap breach, preserving the greater actual exposure instead of hiding it.

The permanent input hash is derived at the boundary from normalized **actual provider create inputs**. Asset label, spec formatting, output path, worker, grant and source release cannot reset it. Multipart filenames are attribution, while image bytes/type/order remain bound. The full exact wire contract, including filename, is separately signed and compared before dispatch. JSON field order does not change the semantic claim. This pilot denies all intentional same-input repeats; future repeat authority must use a separate authenticated purpose and reviewed predecessor evidence, never deleting or renaming a claim.

Mandatory native controls are authenticated before reservation and again before every create. Approval alone, even authentically signed, cannot dispatch without a separate purpose-admitted control proof. Changed, expired, unbound or revoked control records reject and keep any existing hold. The signer must admit only tested native provider/proxy evidence; synthetic fixture signatures are never that authority. Recovery may validate original controls at the recorded reservation time solely to settle prior exposure, never to dispatch.

The source receipt recursively hashes the actual local ESM dependency bytes, including triangle acceptance and wire-plan construction. It is not a full deployed build/dependency attestation. Real deployment must additionally prove immutable runtime/package bytes and actual IAM/key custody.

## Wire, runtime and artifacts

The request descriptor binds actual immutable create bodies for the retained Meshy/Tripo/Rodin/Replicate adapters. Actual dispatch normalizes plain fixed init/headers before awaiting, rejects accessors, binds the real bearer credential fingerprint to the signed API account, verifies the selected model endpoint, compares JSON bytes or frozen multipart bytes, and writes `DISPATCHING` durably before transport. Meshy preview/refine permits only the previously acknowledged task binding, with final charge evidence for both operations.

Each create gets exactly one HTTP invocation. Shared reservations and concurrency remain held after uncertain results. The local AbortSignal, polling, artifact streaming and wave process have an overall bound of twenty minutes; provider response JSON is bounded to 1MiB and artifacts to the approved local byte ceiling. **Local abort does not stop a remote paid provider job.** Actual tested provider/proxy hard runtime and cash/credit ceilings, without auto top up, remain mandatory external activation evidence. A signed claim of fixed pricing alone is not that proof.

Artifact downloads require exact signed HTTPS hosts, public resolved addresses, no redirects and no embedded credentials. The native TLS lookup uses the already validated DNS answers, closing re-resolution/rebinding. Private and mapped IPv6 addresses reject before connection. Oversized/failed streaming removes partial files. Mutable remote reference URLs and currently unadmitted Tripo/Replicate uploads fail closed; existing verified source bytes must be materialized through a governed fixity upload instead of guessed or regenerated.

## Recovery

`node model_forge/reconcile-spend.mjs --claim <claim-hash> --status SUCCEEDED|FAILED [--task <exact-task-id>]` is read-only with respect to providers and requires separately enabled protected reconciliation configuration. It reauthenticates original signed request/balance snapshots at the reservation time, then verifies current final charge receipts. It cannot dispatch, poll or acquire a still-live execution. Missing task identity requires provider investigation and retains full exposure. Only an expired history with zero durable dispatch markers may release a proved zero charge; its permanent claim remains. No automatic snapshot rollover, unknown-charge release or retry is implemented.

## Verification and exact remaining admission gates

The dedicated source workflow checks the PR head SHA directly and runs actual shipped behavior, retained structural/promotion contracts, adapter wire contracts, pinned DNS streaming, and Studio paid containment using Node22 with no provider credentials or paid calls. Its frozen-graph Studio job runs lint/types and the retained Studio suites. The existing targeted unit harness tests the actual public export's zero-transport denial, while preserving private adapter transport regressions through exports appended solely to an isolated temporary transpiled test copy. Production exports, runtime gates and source bytes are unchanged by that harness; every transport there is mocked. Local results use Node24 and are recorded separately. Test signatures, accounts, media bytes, receipts, transports and serialized transaction persistence are explicitly synthetic. They are software evidence, not native Firestore contention, provider/account, real billing, deployed rules, hardware or release acceptance.

| Gate | State / exact action |
|---|---|
| Source owner admission | Deliberately admit this isolated donor into refreshed #421, plus accepted #431/numeric and #436 owners. Re-run final source, Studio type/lint/build and security checks on the admitted exact head. No merge performed here. |
| Shared store/configuration | Deploy the exact admitted source and immutable build into the canonical protected project; prove #436 and Forge use the **same** provider/account document and trusted snapshot, real concurrent transactions, client rules and least-privilege Admin IAM. No live store or configuration mutation performed. |
| Account and pricing | Install actual account-attested credential fingerprint, current native API balance, independent price/control evidence and authentic bounded approval through protected issuer custody. No real approval or balance is synthesized. |
| Provider enforcement | Produce tested provider/proxy hard runtime, cash/credit caps and no-auto-top-up readback for every admitted operation. Local timeouts/source tests do not supply these. |
| Actual charge feed | Establish independent authentic final task/charge reconciliation, including lost acknowledgement investigation and explicit account snapshot rollover. Missing/ambiguous charge stays quarantined. |
| Other consumers | Python image dispatch belongs to #436. Studio adapters are hard disabled pending owner gateway integration. Captured Reality/movie/other paid consumers require their existing owners to adopt the same protected account protocol before any activation; no source proof from this donor transfers to them. |
| Asset/release acceptance | Candidates remain unapproved until governed cleanup, actual-scene visual/performance acceptance and deliberate promotion. No paid candidate, deployment, device receipt or Golden Master admission produced by this source donor. |

None of these external gates is waived by a green source workflow. The launch receipt must keep `providerCallAuthorized=false` and `paidExecutionPerformed=false` until actual authority and enforcement proof exist.
