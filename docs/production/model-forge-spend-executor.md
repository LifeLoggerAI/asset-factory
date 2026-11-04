# Protected Model Forge submission donor

Replicate polling credentials are restricted to the canonical HTTPS `api.replicate.com/v1/predictions/<returned-id>` endpoint. The returned ID must be a bounded path-safe token; supplied polling URL bytes must match that exact endpoint, without credentials, port spelling, query, fragment or normalized path tricks. Every polling result must retain its prediction identity and any repeated polling metadata must remain canonical. Read requests use `redirect: error`; token-bearing requests never follow a provider-returned redirect or foreign URL. This is source validation, not live provider acceptance.

This compatible Model successor starts from Factory owner PR #421 at `1d2439e7de4125ac1d4597050d8de7249a3102bf`, tree `184fd68ae026c15667aa4c1f26f869b001e8cf04`, and retains previous owned #448 `43232430f432fbb8e6f777cef10a252377056be5` as an explicit merge parent. Only this document, the Model spend client and its focused test change against that owner. Geometry, actual Forge callers, canonical gateway, IMAGE, Studio and gateway-to-Forge integration source remain the exact owner bytes.

The predecessor `requestJson` made three synthetic billable POST invocations after two HTTP 429 responses, from one call with `maxRateLimitRetries=2`. The predecessor candidate loop could also regenerate after polling, download or structural-validation errors without charge reconciliation. `URAI_MODEL_FORGE_SPEND_AUTHORIZED=1` supplied no authentic bounded approval or shared account reservation.

## Actual submission boundary

`model_forge/model-spend-client.mjs` uses the canonical Factory #445 `/api/worker/production-spend` contract already incorporated by current owner #421; it does not create a second wallet, gateway, approval authority or policy checker. That gateway owns genuine Ed25519 approval validation, current source/account/pricing/hard-control records, one canonical account transaction, bounded retry and independent signed actual-charge reconciliation. Labs #229 remains offline consistency authority and cannot authorize a provider call.

The CLI now treats its environment flag as execution opt-in only. Dry-run always reports `spendAuthorized=false` and `provider_call_authorized=false`. No local flag, generated plan, receipt or job mapping opens a paid submission.

For each billable POST, the client:

1. Checks actual Git HEAD equals protected `URAI_SOURCE_SHA` or `ASSET_FACTORY_EXACT_HEAD`, with all five executor/imported geometry and protected artifact transport source files tracked, present and unchanged.
2. Materializes exact request bytes, content type and effective headers once; derives the actual credential and semantic header fingerprints before any gateway admission. Rodin multipart serialization is deterministic and independently parses back to identical binary contents.
3. Binds SHA-256 of `POST\n`, exact HTTPS endpoint, `\n`, and body bytes. It restricts provider origins to the existing actual adapters.
4. Requires a protected exact request-digest-to-job mapping, calls non-authorizing preflight, and checks the source, provider, model, asset, endpoint, request size, body digest, approved content type, source-spec digest and request digest. It derives the account identity from the protected envelope and requires the actual credential fingerprint to match a fresh verified account/credential receipt. Current protected controls and pricing must match all actual transport fingerprints, the account, source, model and approved budget/rates.
5. Requires the gateway's fresh atomic reserve response to echo the exact job digest, source, protected account, all four transport fingerprints and unchanged runtime cap before submitting once. A missing or drifted echo retains the hold and produces zero provider invocations.
6. Applies the granted runtime deadline to subsequent provider polling and artifact downloads. Reports observations without making any actual-price, final-charge or retry claim.

Unknown reservation responses never produce a provider invocation. Unknown provider responses, HTTP errors, lost outcome delivery, failed polls, failed downloads and rejected geometry never authorize an automatic billable retry or release a hold. The canonical gateway keeps the full cap reserved until authentic independent charge reconciliation. A future invocation still needs current gateway admission; the session never resubmits the same request.

The only read-only POST exceptions are the existing Rodin `/api/v2/status` and `/api/v2/download` endpoints. Existing GET polling can retain its bounded rate-limit retries. Meshy preview and refinement are separate paid leaves and require separate exact requests/jobs; one reservation never silently covers both.

## Protected handoff and prepared evidence

Required configuration:

| Setting | Role |
| --- | --- |
| `ASSET_FORGE_SPEND_GATEWAY_URL` | Exact HTTPS `/api/worker/production-spend` deployment matching the protected issuer origin, without redirects. |
| `ASSET_FORGE_SPEND_WORKER_TOKEN` | Protected worker credential of 32–4096 printable ASCII characters without whitespace or controls. |
| `ASSET_FORGE_SPEND_GATEWAY_ORIGIN` | Independently provisioned protected issuer origin; exact origin-only HTTPS URL. |
| `MODEL_FORGE_SPEND_JOB_IDS_JSON` | Object mapping exact 64-hex request digests to genuine protected job IDs. It is routing, not approval. |
| `URAI_SOURCE_SHA` or `ASSET_FACTORY_EXACT_HEAD` | Independently verified immutable executor build, equal to actual clean Git HEAD and the gateway source/control binding. |

The protected job requires `executor.content_type`, `executor.credential_sha256`, `executor.semantic_headers_sha256` and `executor.source_input_sha256` matching the actual frozen transport and original source specification. Credential fingerprints hash UTF-8 compact sorted-key JSON of lower-case effective credential headers, including the exact scheme/value, for example `{"authorization":"Bearer <protected-token>"}`. Semantic fingerprints hash the other explicit effective headers, including content type, accept, idempotency and account/project routing; the generated content length is removed. This header convention preserves literal Unicode and is distinct from the gateway's escaped job canonicalization. Credentials are read from the actual transport headers and raw values never enter evidence.

The preflight envelope returns `protected_controls` and `protected_pricing`; snapshot returns the same records at the top level. Both must bind the four actual fingerprint fields. Account readback requires the exact `credential_sha256`, `credential_binding_verified: true` and nonempty `credential_binding_receipt`; account/control/price timestamps and price rates must remain fresh. Pricing binds provider, account, model version and body digest, includes a nonempty protected receipt and exactly matches the signed job's current rates. Reserve, record and snapshot send the derived protected account and all actual fingerprint fields. Only preflight may omit account identity while obtaining protected readback. Missing records or legacy approvals without these fields fail closed.

 Its approved `input_sha256` includes both the original source-spec digest and exact submitted request digest. Existing signed approval covers those fields through the gateway's complete job digest. These additions must be prepared by the existing authority owner, never fabricated by the worker.

Each attempted candidate retains non-authorizing request identity under its private/uncommitted run directory. After reservation it retains job/attempt IDs and observed task/outcome status with `reconciliation_required=true`. These records allow exact next-step preparation without publishing prompts, binary inputs, credentials or private approvals into the repository.

Mutable remote image URIs remain fail-closed before paid generation. Approval of URL text does not verify the bytes a remote provider retrieves. A protected materializer must supply proven immutable bytes or a verified provider-file boundary. Meshy local files are bounded and encoded into exact inline bytes; existing data URIs and Rodin's local binary multipart payload are bound by the exact body digest. Tripo/Replicate image references require that materializer; their text lanes remain prepared.

Meshy text refinement includes a provider-created preview task ID. Its exact second request cannot be approved before that ID exists. The CLI records `meshy-preview-continuation.json` plus the required refinement request identity and stops if no genuine matching refinement job exists. A later `--resume-meshy-preview <checkpoint.json>` invocation checks that the canonical gateway has independently reconciled the original exact preview request as `SUCCEEDED`, with the same protected task ID and a charge-receipt digest. Its non-authorizing checkpoint also captures the original admitted account/source/credential/header/input/content-type fingerprints. Continuation derives actual transport fingerprints again and verifies the protected job, account, controls and price snapshot. Missing old checkpoint bindings or credential/account drift cannot reuse a preview task. Only then does it skip the preview and refine under a separately approved atomic reservation. A checkpoint file alone does not grant continuation, create a blanket approval or repeat the preview.

## Validation and remaining admission

Local built-in Node tests cover exact body/source/model/content-type/credential/header/account/control/pricing binding, actual Git source rejection, deterministic multipart binary readback, all actual adapter leaves, missing/malformed admission, lost reservation/provider responses, single submission on HTTP 429, synthetic competing workers, protected runtime deadlines, the candidate retry loop and retained CLI failure receipts. Synthetic signatures, transactions and transports are not genuine authority or deployed contention proof.

No paid provider call, payment, real approval signing, deployment, main/owner mutation, merge, asset promotion or release acceptance occurred. Native exact-head verification must be recorded separately; local passes do not clear unrelated native failures.

Before activation, the Factory owner must deliberately incorporate this donor and compatible geometry changes, regenerate combined-head evidence, admit #436's current source, deploy the exact protected gateway/client source, and verify real Firestore contention, client rules/Admin IAM, immutable build identity, actual provider/proxy runtime and cash/credit limits, protected credentials, current account/pricing/rights/input records, genuine bounded approval, kill switches and trusted charge settlement. The client cannot compensate for a fictitious server control receipt.

Studio TypeScript media adapters, movie generation, reconstruction, voice and other paid consumers retain their own integration owners and are not certified by this Model Forge donor. Geometry, literal art/audio review, source security, physical-device performance and production release remain separate acceptance gates.

## Current-owner authority, lifetime and private transport correction

The current owner's strict calendar parser, complete approval/source/account/control/pricing/rates expiry minimum, exact origin and canonical route, monotonic lifetime and source/proof/time checks around provider and outcome awaits remain intact. `checkAdmission` finishes synchronous actual Git verification and all protected proof checks before its final time gate. Polling and downloads retain the current owner's same admission checks.

V1's protected `authority.binding` must exactly equal the job's well-formed accepted specification repository/head. That authority may differ from the Factory executor repository/head. The executor remains independently bound to the actual clean Git source, approved executor and current enforcement controls. This is the canonical V1 distinction, not authorization to substitute an arbitrary executable build.

Invalid `Headers` conversion now throws only a generic `MODEL_SPEND_BLOCKED` error. The original exception, its credential value and cause are discarded. The gateway's actual worker token is checked for a bounded printable ASCII value before constructing any authentication request; invalid tokens cause zero gateway/provider calls and never appear in the error. No raw credentials are copied into receipts.

The test fixture retains the complete current-owner assertion tail and initial five owner cases. It adds the nine earlier root successor groups, a corrected rollback case and three credential-privacy groups. The final source-delay regression is triggered by the actual `record` boundary, rather than counting source reads. The rollback case first validates reservation timestamps and reaches one synthetic provider POST, then advances monotonic time while rolling back wall time and requires output suppression with the full hold retained. Current owner's six newer cases, including outcome-delivery rollback, are unchanged.

Earlier #448 iterations used syntax-only connector checks during the execution outage. This compatible successor is prepared from immutable owner/client contents and receives its own isolated clean-tree execution receipt. Only results bound to the final source qualify; native exact-head execution remains separate. The preceding 172-group Model and 73-group gateway results certify only the historical 43232430 tree. This successor additionally retains the new semantic-input cases, mandatory semantic echo/continuation bindings, full five-file clean-source proof and the current owner’s protected artifact suite. Fresh combined results and exact-head native evidence must be read separately; prior passes do not certify these new bytes. Genuine protected deployment/approval/credential/source/control evidence, actual provider and independent charge reconciliation, native combined-source checks and production acceptance remain separate gates. This source change grants no provider invocation, approval signing, merge or deployment.

## Semantic input and artifact owner preservation

This compatible successor starts from immutable owner 1d2439e7 and retains its complete semantic-input and artifact source. Actual frozen transport derives `semantic_input_sha256` alongside the exact request digest and passes it through protected approval/control/pricing, reservation, observations and settled Meshy continuation. Canonical global semantic and receipt claims remain owned by the current gateway; no second claim registry or waiver is introduced.

The existing protected gateway-origin setting must be provisioned from the authentic protected deployment. A matching ordinary environment value is not independent issuer or financial approval. Genuine protected origin/credential provisioning, immutable executing proof, hard controls, bounded signed approval, native current-head checks and independent settlement remain activation gates.

The current owner additionally pins the initial gateway destination and normalized worker credential across environment changes, requires signed approval identity fields, and accepts successful output only after the canonical non-authorizing/non-settling observation acknowledgement. A lost outcome remains unknown with its full hold. `scripts/protected-replicate-model3d-smoke.mjs` routes the existing manual one-shot workflow through this real client, fences polling/GLB read/persistence with the same admission, rejects foreign task/artifact origins and retains only an exact known-task kill capability. An unknown create cannot retry or cancel an invented task. The original manual confirmation, main, protected environment, WIF cleanup and one-time marker controls remain.

Artifact retrieval remains the owner’s shared `protected-artifact.mjs` transport, with exact admitted hosts, public-address validation, the validated address pinned to the TLS hostname, bounded response bytes and the same admission clock before and after DNS/request/stream boundaries. The new module is included in actual clean Git validation. Actual Forge and canonical/global-claim fixtures and workflow bytes remain current-owner source; this donor changes only the Model client, its retained/extended tests and this document.
