# URAI Multimodel Intelligence Router Authority

Status date: 2026-09-25

Parent authority: Asset Factory PR #284 exact head `27c8839bf22104c7eaaf81776ea67e7ab66a4a2d`.

This successor implements the general reasoning/text intelligence routing portion of the launch-required `multi-model-provider-router` canon lane without changing the parent media-provider authority.

## Runtime authority

Canonical implementation:

- `assetfactory-studio/lib/server/intelligenceProviderRouter.ts`
- protected execution surface: `POST /api/system/intelligence`
- protected diagnostics surface: `GET /api/system/intelligence`
- system-manifest readiness projection: `/api/system/manifest`

The protected execution route requires:

1. configured Asset Factory API key;
2. authenticated Asset Factory operator/admin authority when auth is enabled;
3. a tenant-bound request;
4. an allowlisted task;
5. an explicit privacy class;
6. explicit cloud-processing authority;
7. explicit external-provider spend authority;
8. explicit consent for the sensitive-cloud privacy class.

There is no anonymous/public inference path.

## Provider registry

Current governed reasoning providers:

| Provider | Credential | Model authority | Transport |
| --- | --- | --- | --- |
| OpenAI | `OPENAI_API_KEY` | `ASSET_FACTORY_OPENAI_REASONING_MODEL` | Responses API |
| Anthropic | `ANTHROPIC_API_KEY` | `ASSET_FACTORY_ANTHROPIC_REASONING_MODEL` | Messages API |
| Gemini | `GEMINI_API_KEY` | `ASSET_FACTORY_GEMINI_REASONING_MODEL` | generateContent |

No reasoning model name is hardcoded. A provider without both credential and explicit model configuration is not route-eligible.

The router does not add xAI, Mistral, Meta/open models, or another vendor merely to increase provider count. Those require a concrete task purpose, integration contract, privacy boundary and evidence before registry admission.

## Supported task classes

- reasoning
- summarization
- extraction
- classification
- narrative
- translation

Task expansion requires an explicit contract change.

## Privacy classes

### `local-only`

Third-party execution is prohibited. The current Asset Factory router fails closed because it does not claim a local reasoning runtime.

### `cloud-allowed`

A configured third-party provider may be used only when cloud-processing and spend authority are both enabled.

### `sensitive-cloud-with-explicit-consent`

Cloud execution additionally requires request-level explicit consent. Missing consent fails before provider network access.

## Routing and fallback

Default preference order is `openai,anthropic,gemini`, configurable by `ASSET_FACTORY_INTELLIGENCE_PROVIDER_ORDER`.

Routing filters by:

- task capability;
- configured credential;
- configured model;
- explicit request allowlist;
- preferred provider;
- temporary provider health state.

A failed provider enters a bounded cooldown and the router may attempt the next eligible provider. Fallback never bypasses privacy or spend authority.

## Receipts and observability

Successful executions return `urai-intelligence-execution-receipt-1` with:

- task;
- privacy class;
- selected provider;
- selected model;
- provider attempt order;
- per-attempt latency;
- failure class for failed attempts;
- provider-reported input/output token counts when available;
- whether fallback was used;
- explicit `promptLogged: false`;
- cloud/spend authority state.

Raw prompt content is not written into the receipt.

Dollar cost is intentionally not hardcoded into the router because provider prices can change. Provider-reported usage is retained as the stable metering input; financial cost policy remains a separately versioned budget/accounting concern.

## Failure behavior

The router fails closed on:

- local-only data sent toward cloud;
- cloud-processing authority off;
- spend authority off;
- missing explicit sensitive-data consent;
- invalid provider order;
- missing credential/model;
- no healthy compatible provider;
- timeout;
- authentication error;
- provider quota/rate limit;
- provider 5xx/error response;
- invalid or empty text response.

Provider requests reject redirects.

## Exact-head proof

`scripts/test-intelligence-provider-router.mjs` verifies:

- no-provider default;
- local-only rejection before network access;
- cloud authority gate;
- spend gate;
- sensitive consent gate;
- provider ordering;
- OpenAI request with `store:false`;
- OpenAI rate-limit failover to Anthropic;
- Anthropic version/auth headers;
- Gemini direct request contract;
- receipt fallback and prompt-not-logged state;
- protected execution-route API-key/operator/tenant boundaries.

The existing multimodal provider workflow runs this contract with external provider secrets absent and provider spend disabled.

## Truth boundary

This source implementation is not LIVE provider certification.

LIVE VERIFIED still requires, for each activated provider:

- approved secret binding;
- approved model/version;
- provider account capability;
- privacy/legal data-processing authority;
- budget/spend authority;
- deployed runtime identity;
- minimal governed live smoke;
- consumer integration;
- retained runtime receipt.

No current source commit authorizes production provider spend by itself.
