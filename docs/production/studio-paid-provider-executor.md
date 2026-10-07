# Protected Factory Studio provider submissions

This is an isolated source donor on Asset Factory owner #421 at `e0d1ff4967562684a866386662bcc01e7d8af4de`. Fresh UrAi Studio #159 at `5d2cfdf3dcae738e0ebde50ab70e85f1d02c2e36` contains local/fallback renderers and a Jobs bridge, with no direct billable provider HTTP leaf. The actual TypeScript Studio provider implementations are in this repository. Their source protection must not be reported as deployed UrAi Studio generation or as Jobs/Life Movie acceptance.

## Actual boundaries changed

`assetProviderRuntime.ts`, `assetVideoProviderRuntime.ts` and `higgsfieldClient.ts` route all their billable POSTs through `protectedProviderRequest.ts`. Coverage is OpenAI images/speech, ElevenLabs speech, Stability images, Replicate graphics/models/audio/speech/video, fal graphics/models/audio/video, Runway video, and Higgsfield image/video lanes. Local proof remains local; unsupported/configuration-only adapters do not become authorized by this change. Model Forge, Python IMAGE, Jobs, Captured Reality compute, Spatial conversation, Storytime and other consumers keep their separate owners.

The client uses the existing Factory `/api/worker/production-spend` contract from IMAGE #436, including its typed successor #439. It does not create another approval store, sign approvals, settle charges, change account records, install credentials, or mutate the canonical gateway. Its offline digest merely binds the server's non-authorizing preflight to atomic reserve. Only the protected gateway checks real signed approval, current authority/account/pricing/controls, shared account contention, and prior attempts.

## Protected configuration and exact identity

The executor requires an explicit HTTPS `ASSET_FORGE_SPEND_GATEWAY_URL`, a protected worker bearer `ASSET_FORGE_SPEND_WORKER_TOKEN` of at least 32 characters, and `FACTORY_STUDIO_SPEND_JOB_IDS_JSON`, a mapping of exact submitted request digests to existing protected job IDs. A map entry is routing, not approval. Missing/invalid configuration, response, build provenance, or admission blocks the provider request. Redirects and gateway retries are forbidden.

`URAI_SOURCE_SHA` (or `ASSET_FACTORY_EXACT_HEAD`) must match actual Git HEAD in the worker's repository. All four protected source paths must be tracked and clean. The worker rechecks its source and input before preflight, before reserve and immediately before provider submission. The deployed service must supply an immutable, independently verified exact build; declaring an environment SHA or pointing at a clean source checkout cannot alone prove which compiled bytes are executing. A deployment without actual checked source provenance stays closed. An owner must supply that protected runtime rather than bypass the check.

The gateway currently requires one matching `source_sha` for worker, gateway and enforcement proof. Admission therefore requires one deliberately converged source and coordinated exact-source deployment. Neither this isolated donor's SHA nor a different consumer's old gateway SHA can be used to authorize the combined runtime.

The job must name `consumer="factory-studio"`, the actual provider and exact model, `rights_reviewed=true` under genuine protected authority, and `authority={repository:"LifeLoggerAI/asset-factory",sha:<actual exact source>}`. Server validation and genuine approval remain required; the client does not turn the rights boolean into legal authority.

| Protected binding | Actual value checked before a provider request |
| --- | --- |
| `job.input_sha256` | Contains both full canonical GenerateRequest input digest and exact request digest |
| `executor.source_sha` | Actual clean worker source and shared gateway/enforcement identity |
| `executor.endpoint` | Exact canonical HTTPS endpoint; POST redirects forbidden |
| `executor.request_sha256` | SHA-256 of UTF-8 `POST\n`, endpoint, `\n`, then materialized request bytes |
| `executor.asset` | `tenantId/jobId/lane`; defaults the omitted tenant to `default` |
| `executor.request_size` | Decimal submitted byte length |
| `executor.source_input_sha256` | SHA-256 of sorted-key JSON GenerateRequest, including prompt, source references and metadata; finite source numbers are preserved |
| `executor.content_type` | Exact materialized content type, including deterministic multipart boundary |
| `executor.credential_sha256` | SHA-256 of sorted JSON provider authorization header identities; protected record only, never a public credential receipt |
| `executor.semantic_headers_sha256` | SHA-256 of sorted JSON non-credential headers, including content type, accept, prefer and provider idempotency headers |

All additional executor fields and input fixity are covered by the canonical signed job digest even though the generic gateway does not interpret their consumer-specific meanings. The client checks those meanings against the actual submission. Source JSON sorting is separate from the ASCII/integer job canonicalization matching Labs #229 and Factory #436; source prompts/metadata never become public receipts. Stability multipart requests use deterministic frozen bytes. OpenAI and ElevenLabs require explicit voice identities; no stock voice is silently selected. fal/Runway video require a named exact model and submit it in their endpoint payload. These conditions do not themselves establish accepted Adam voice/likeness or provider/model compatibility.

## Attempts, continuation and unknown outcomes

One async execution session can issue one paid POST. The protected account transaction prevents a requeued/repeated session reopening the same job. A prior failed worker observation, local failure, missing task ID, lost reserve response, expired lease, timeout, successful response, or output artifact never releases the account hold. The original job's genuinely approved retry can proceed only after the canonical gateway verifies the independently signed final charge receipt and corrective action.

The reservation's runtime must exactly match the signed job's runtime and spans submission, response parsing, status polling, artifact retrieval and decode. Continuations are GET-only and use that same abort/deadline. Credential-bearing status requests must remain on the admitted provider origin. Replicate requires canonical `https://api.replicate.com/v1/predictions/<same task ID>`; Higgsfield requires its exact same-request status path. Neither status response may replace the admitted task identity. Artifact GETs carry no provider credential, reject redirects/private endpoints and retain configured byte limits; voice, video and JSON bodies are bounded while streaming. Gateway failure to record a successful result blocks its return. Failed observation transport leaves the reservation unresolved. Reports send only outcome/task identity, never actual-cost assertions, response bodies, prompt contents or private source media.

A local deadline can stop the worker and retain funds; it cannot establish remote-task cancellation or a financial hard cap. Current tested provider/proxy cash/credit/runtime stop, cancellation and kill-switch proof remains required in the canonical protected controls. Unknown remote outcomes retain the full cap until authentic reconciliation. Runtime acceptance must verify these real controls before any paid canary.

## Verification and admission still required

Local Node 24 passes 44 actual TypeScript leaf adversarial groups with synthetic transports and real temporary Git repositories. They cover 15 primary provider/type combinations, altered exact bindings, missing configuration/source, old/dirty/untracked source, source changes around reservation, uncertain/lost responses, duplicate/queued/concurrent attempts, deadline and read-only/origin/task continuation, missing voice identity, observation failure and modified reserve responses. The retained targeted units, four-lane Replicate registry and five Higgsfield behavior cases also pass. Strict TypeScript 5.9.3 source checking and the owner's ESLint 9.39.2/Next 16.3.6 configuration pass for all four affected source files. A dedicated exact-source native workflow repeats the actual TypeScript suite with no provider credentials or real network requests. Native result links belong in the PR readback; local tests cannot clear a failed native gate.

Before activation, the existing Factory executor/convergence owner must admit compatible IMAGE/gateway and consumer donors, deploy the unchanged exact build, read back actual dedicated Firestore/rules/Admin IAM and shared contention, install protected credentials and separate approver/reconciler keys, verify account identity/current pricing/rights/input fixity/remote hard controls, obtain a real bounded approval, and install a trusted actual-charge settlement feed. Authentic private capture/voice/person rights and literal identity review remain separate. No paid call, credential installation, production deployment, merge, provider contact, synthetic real approval, or main mutation is performed by this source donor.
