# Protected spend across repositories

This source donor extends the canonical `/api/worker/production-spend` gateway and repairs the existing image executor's credential/account binding. It does not create an approval, register a production worker, sign a proof, configure an account, settle a charge, or accept a release. Legacy jobs retain their same-source rule and now require actual credential/header/input fingerprints. A v2 worker cannot access a legacy job, and a legacy shared token cannot access a v2 job.

## Mandatory same-repository request binding

Every non-reconciliation worker call requires `credential_sha256`, `semantic_headers_sha256`, `source_input_sha256`, `semantic_input_sha256` and `content_type` matching the signed job executor and fresh protected controls. The source-input and request digests must both appear in the signed input list. The protected account must map that exact credential to its authenticated provider/account with `credential_binding_verified:true`, a nonempty `credential_binding_receipt`, and fresh trusted readback. Missing or self-asserted caller fields cannot create that mapping.

`account_id` may be absent only on preflight, where a caller derives it from the verified protected account. Reserve, record and snapshot require the exact account. Preflight exposes `envelope.protected_controls` and `envelope.protected_pricing`; snapshot exposes `protected_controls` and `protected_pricing` alongside the scoped job/account. Reserve echoes account and the five fingerprints, with the existing job digest, executor source and runtime. The actual image worker verifies those echoes before dispatch.

The protected pricing record must bind the same provider, account, `model_version`, request hash and all five credential/header/input/content fields. It requires `trusted_readback:true`, a nonempty `receipt`, fresh `observed_at`/`expires_at`, and `rates` exactly equal to the signed `job.budget.rates`, whose `verified_at`/`expires_at` must also be current. Missing, stale or mismatched price proof rejects all worker actions before exposing a snapshot, recording an observation or making a reservation. An account selector in the effective headers cannot reuse a price for another account.

The image leaf builds one Request before admission, hashes the exact credential header dictionary and remaining explicit semantic headers (excluding transport-derived content-length/host/connection), recognizes configured custom auth headers, rejects duplicate names ignoring case, verifies source input again, and dispatches the same frozen body/headers. Outcome and snapshot calls retain those bindings. Prior approvals lacking authentic account/credential mappings stay closed. An environment token change after preflight cannot replace the frozen Request credential.

## Required authentic deployment evidence

Keep the Factory gateway `URAI_SOURCE_SHA` equal to its actual Factory source. Non-reconciliation routes read the clean tracked gateway Git identity before accessing a worker job. A runtime that cannot provide that provenance stays closed. The independently verified deployment receipt must establish the actual compiled and deployed gateway and executor source, account and provider controls. A source check or synthetic CI result cannot supply that receipt.

Configure `ASSET_FACTORY_SPEND_WORKER_TOKENS_JSON` in protected server configuration. Each unique token (at least 32 characters) maps to a fixed identity and scope:

```json
{
  "worker-id": {
    "token": "PROTECTED_SECRET",
    "executor_repository": "owner/executor-repository",
    "executor_source_sha": "EXACT_EXECUTOR_GIT_SHA",
    "consumer": "consumer-name",
    "tenant_sha256": "EXACT_TENANT_SHA256",
    "provider": "provider-name",
    "account_id": "AUTHENTIC_API_ACCOUNT_ID",
    "credential_sha256": "EXACT_EFFECTIVE_CREDENTIAL_SHA256"
  }
}
```

The token must differ from every other worker token, the legacy worker token, and the reconciliation token. The gateway never accepts `body.worker_id` as authentication. Worker identities and scopes require genuine protected provisioning; client requests cannot supply them.

Configure `ASSET_FACTORY_SPEND_VERIFIER_PUBLIC_KEYS` separately from approver and reconciler keys, using the existing `{key_id:{subject,publicKey}}` public-key format. Verifier subjects and public keys must differ from both other roles. Product code has no proof generator or signing path.

## Signed job and proof bindings

The approved protected job uses `executor.binding_version = 2`, `executor.repository` and `executor.source_sha` for the exact executor repository/head, and `executor.gateway_repository = LifeLoggerAI/asset-factory` plus `executor.gateway_source_sha` for the actual gateway head. Its authority repository/head must equal the executor identity.

The executor also binds `worker_id`, `tenant_sha256`, `credential_sha256`, `source_input_sha256`, `semantic_input_sha256`, `semantic_headers_sha256`, `content_type`, `request_sha256`, `endpoint`, `asset`, and `request_size`. Provider/account/model/consumer remain signed top-level job fields. `input_sha256` must include the exact source-input and request hashes. The approval signs the canonical job digest, which covers these fields and both proof references.

`executor.deployment_ref` and `executor.controls_ref` are SHA256 digests of the complete signed records stored at `assetFactorySpendDeployments/<digest>` and `assetFactorySpendControls/<digest>`. Both records require an authenticated Ed25519 verifier, `verified:true`, `trusted_readback:true`, a fresh `observed_at`/`expires_at`, a nonempty `deployment_id` and `proof_receipt`, and the exact same `binding` object below. Both deployment IDs must match. Controls additionally retain every existing authenticated provider hard-cap/account/request/runtime/top-up field and must set `enforcement_source_sha` to the actual Factory gateway SHA.

All non-reconciliation calls send these exact fields:

```text
job_id, worker_id, executor_repository, executor_source_sha,
gateway_repository, gateway_source_sha, consumer, tenant_sha256,
provider, account_id, credential_sha256, source_input_sha256,
semantic_headers_sha256, content_type, request_sha256,
endpoint, model, asset, request_size
```

Those fields are also the proof `binding`. `request_size` is a string; callers using HTTP bodies should bind its decimal byte length. A recommended request hash is SHA256 of `POST\n<canonical endpoint>\n` followed by the actual frozen body bytes. Credential and semantic-header hashes should use stable JSON of normalized effective header entries, with provider credential headers separated from the remaining headers. They must describe the actual dispatched credentials and headers, never caller financial-authorization labels.

Scope checks, signed approval binding, and fresh independently signed proof verification precede `snapshot`, `record`, `preflight`, and `reserve`. A signed proof from a different job, deployment, worker, source, tenant, account, credential, or request cannot be reused. Preflight remains read-only and non-authorizing. Reserve rechecks all evidence in the same global account transaction before adding one attempt and durable per-job/account hold.

## Outcomes and acceptance

Lost reserve responses, dispatch errors, aborts and completed text/audio all retain uncertain charges. `record` only changes an admitted attempt to `RECONCILIATION_REQUIRED`; it cannot release the hold, assert actual cost, permit a retry, or finalize the job. The existing independently authenticated and signed final charge receipt remains the only settlement mechanism. Account reservations remain global across repositories.

Synthetic tests and native compilation demonstrate source behavior only. Before any paid dispatch, genuine protected account balances, explicit bounded approval, pricing, reuse/rights/source authority, exact deployed controls, worker mappings, compiled-source deployment proofs and an independent actual-charge feed must all be available and verified. No production execution or acceptance is implied by this donor.

## Mandatory absolute admission window

Preflight returns `admission_expires_at`, the minimum expiry of the actually verified signed approval, current source authority, API account, provider controls, protected pricing and signed rates. V2 additionally includes its independently signed deployment expiry. The actual signed approval remains available as `envelope.job.approval`; a serialized preflight is not altered by later storage writes.

Reserve returns mandatory `reserved_at` and `admission_expires_at` and persists those same timestamps on its attempt. Its expiry is the minimum verified window and `reserved_at + max_runtime_seconds`. The gateway revalidates time after all protected reads and again immediately before reservation writes. Preflight is still non-authorizing. No new signature, issuer or local financial approval is introduced.

Clients must reject missing, malformed, future or expired timestamps; require the reserve expiry no later than preflight expiry or reservation time plus approved runtime; anchor their conservative local runtime before awaiting reserve; and use the minimum of all windows. Recheck actual immutable source and protected bindings after every asynchronous admission boundary, immediately adjacent to paid dispatch, and across response/body/output completion. Delayed reserve delivery never restarts runtime. Expiry retains the full reservation for independent settlement and never permits another paid call. Worker outcome delivery remains an observation, including when expiry prevents its delivery. Gateway origin must be pinned by protected issuer configuration before a token is transmitted; an environment-only locator is not proof of canonical admission.

Validation uses temporary synthetic Ed25519 keys, serialized transaction fixtures and simulated clocks/transports only. It does not issue genuine approval or grant runtime activation. All financial/runtime/provisioning/release acceptance prerequisites remain open until current combined-source evidence and genuine protected records exist.


## IMAGE current-owner continuation

The initial Python IMAGE successor was based on Factory owner #421 `894bcbe5d052589fdcfbcb3144678d060535b53e`. Its final compatible continuation preserves the complete current owner `1d2439e7de4125ac1d4597050d8de7249a3102bf` tree, including permanent semantic input/task/charge claims and bounded DNS-pinned artifact transport. It changes the actual image guard, provider leaf, actual-executor tests and this handoff only.

The client retains the owner origin check and original monotonic/runtime ceiling; preflight expiry cannot exceed any available genuine approval, source authority, account, controls, pricing or rate window. Protected controls now require their actual source/request/caps, trusted freshness and hard-stop receipt. Actual source, request bytes, headers and inputs are checked beside dispatch and after provider/body/outcome completion. The interval timer remains active throughout successful observation delivery and final output validation. A late or invalid reservation stays held; observations cannot settle or authorize retries.

All thirty-five current owner actual-executor methods remain, including the real canonical reservation timer fixture and all five newly admitted owner methods. Ten new grouped methods cover independent proof windows, delayed reserve, actual controls/request drift, late body/record, source drift, source verification latency, clock rollback and changed runtime. That initial source candidate had forty-five methods and required native evidence while the host was offline. The recovered final candidate is verified below.

Actual protected deployment origin and worker credentials, immutable build proof, authentic controls/account/price readbacks, genuine signed bounded approval, native source verification and independent settlement remain activation gates. A matching ordinary environment origin is not independent issuer or financial approval. No provider call, signature, funding, account mutation, owner/main write, merge, deployment or release admission occurred.


Independent current-source review found that the context manager's last source check ran after the provider's final transport/input check. The final callback now rechecks the actual request after that last potentially blocking source check and then checks the original deadline, while the timer is still active. One grouped actual-leaf case covers input, credential and body mutation at that exact final source check. Forty-six Python methods now require current execution; no prior pass transfers.


### Recovered final source verification

The final Python modules parse. The actual executor suite passes46/46 and the complete IMAGE/offline contract suite passes85/85 under Python3 on the recovered host. The exact published #449 predecessor `8e18ec162d07d08c82a362a5013ffffd4df05881` fails the final-exit regression for all three input/credential/body mutation variants; the final callback closes each. Existing thirty-five owner method bodies remain unchanged, including five absolute/source/deadline cases. These are actual local synthetic software checks with zero genuine provider calls or approvals. Current remote-head native verification, authentic deployed controls and financial/runtime/private/art/release acceptance remain separate.


### Current canonical semantic and artifact compatibility

The final source retains owner1d243 semantic_input_sha256 on actual provider requests, protected envelope/control/pricing verification and every reservation/observation echo. JSON key order and whitespace cannot create a different semantic claim; the exact request bytes remain separately bound. Duplicate JSON keys reject before reservation or provider transport. Artifact retrieval retains the admitted HTTPS-host list, one public DNS answer pinned to the socket, original TLS certificate/SNI, no credentials or redirects, HTTP200 only, bounded nonempty response and the original admission deadline. The owner current artifact tests are retained unchanged.

The actual combined IMAGE suite passes89/89:47 executor methods,3 actual artifact-transport methods and39 offline contract methods, zero genuine provider calls. All35 current owner executor method bodies and all3 artifact method bodies are retained. The new semantic case exercises two differently encoded actual requests and a duplicate-key denial. The earlier8e18 final-exit baseline failures and9e55 local46/85 results remain historical receipts; they are not native proof of the current compatible head. The current owner gateway contract also requires semantic_input_sha256 for every cross-repository v2 consumer; each consumer needs a compatible source and genuinely provisioned current protected proof.
