# Higgsfield provider bootstrap - Asset Factory

Status: source integration prepared; account credentials, API balance, App Hosting secret binding, and paid generation are NOT YET VERIFIED.

## Purpose

Higgsfield is integrated as a replaceable media provider behind Asset Factory. URAI retains the direction, budget, storage, provenance, QA, privacy, approval, and release authority.

The provider is dormant unless a server-side provider selector is explicitly set to `higgsfield` and both credentials are present.

## Official API contract verified 2026-09-30

Base URL: `https://api.higgsfield.ai`

Authentication:

```text
Authorization: Key <HIGGSFIELD_API_KEY_ID>:<HIGGSFIELD_API_KEY_SECRET>
```

Generation is asynchronous. A submission returns `request_id`, `status_url`, and `cancel_url`. URAI polls the approved Higgsfield status URL until a terminal state and uses an `Idempotency-Key` derived from the URAI job identity.

Pinned server-side lanes:

- Text-to-video: `bytedance/seedance-2.5/text-to-video`
- Image-to-video: `bytedance/seedance-2.5/image-to-video`
- Cinematic direction: `higgsfield/cinema-studio/4.0`
- Motion transfer: `higgsfield/genjutsu/motion-transfer/v1.0`
- Image generation: `higgsfield-ai/soul/v2/standard`

Endpoint IDs are server policy. Client requests cannot replace them.

## Required secrets

Create these only in the approved secret manager/runtime environment:

```text
HIGGSFIELD_API_KEY_ID
HIGGSFIELD_API_KEY_SECRET
```

Never commit, print, screenshot, email, place in a URL, or expose these values to browser/mobile code.

## Runtime variables

```text
ASSET_FACTORY_MEDIA_PROVIDER=local-proof
ASSET_FACTORY_VIDEO_PROVIDER=local-proof

ASSET_FACTORY_HIGGSFIELD_IMAGE_ENDPOINT=higgsfield-ai/soul/v2/standard
ASSET_FACTORY_HIGGSFIELD_TEXT_VIDEO_ENDPOINT=bytedance/seedance-2.5/text-to-video
ASSET_FACTORY_HIGGSFIELD_IMAGE_VIDEO_ENDPOINT=bytedance/seedance-2.5/image-to-video
ASSET_FACTORY_HIGGSFIELD_CINEMA_ENDPOINT=higgsfield/cinema-studio/4.0
ASSET_FACTORY_HIGGSFIELD_MOTION_ENDPOINT=higgsfield/genjutsu/motion-transfer/v1.0
ASSET_FACTORY_HIGGSFIELD_VIDEO_MODE=auto
ASSET_FACTORY_HIGGSFIELD_VIDEO_RESOLUTION=720p
ASSET_FACTORY_HIGGSFIELD_TIMEOUT_MS=900000
ASSET_FACTORY_HIGGSFIELD_POLL_MS=2000
```

Keep both provider selectors at `local-proof` until credential presence, budget ceiling, protected-runtime secret access, and a separately authorized bounded smoke are verified.

## Provenance boundary

Every Higgsfield artifact is stamped:

```text
syntheticSource=true
truthClass=INTERPRETIVE
sourceTruth=false
```

Higgsfield output must never be labeled RECORDED SOURCE TRUTH or SPATIALLY RECONSTRUCTABLE merely because it depicts a real memory, person, or place. Captured Reality source footage and reconstructions keep their existing governed truth classes.

## Google / App Hosting hookup

Current Asset Factory runtime authority is supplied by the protected `asset-factory-production` environment, not by a hard-coded Google project:

- `ASSET_FACTORY_FIREBASE_PROJECT_ID` — provider-proven dedicated Asset Factory project; `urai-4dc1d` is forbidden as current runtime authority.
- `GCP_WIF_PROVIDER` — protected Workload Identity Provider resource.
- `GCP_DEPLOY_SERVICE_ACCOUNT` — protected least-privilege service-account identity.
- App Hosting backend — must be discovered from authenticated inventory for the dedicated target; do not assume that historical `assetfactory-studio` exists in the shared consumer project.

Do not create a service-account JSON key. Successful WIF exchange alone is not proof of runtime/backend binding.

After Higgsfield credentials actually exist in Secret Manager:

1. Bind both Higgsfield secrets to `assetfactory-studio/apphosting.yaml`.
2. Extend the existing WIF-only provider secret grant workflow to grant App Hosting access to those exact secret names.
3. Create a fresh App Hosting rollout.
4. Verify only sanitized credential-readiness booleans. Never print secret values.
5. Keep provider selectors dormant.
6. Confirm a user-approved spend ceiling.
7. Dispatch one bounded private smoke only after explicit spend authorization.
8. Download the output into URAI-controlled storage, hash it, attach provenance, and record provider request ID/cost evidence.
9. Disable the paid lane again if it is not meant to remain active.

## Account boundary observed 2026-09-30

The browser-console inspection was cancelled before it produced an authenticated account result. Therefore this receipt does not claim:

- a Higgsfield account is authenticated;
- API credentials exist;
- an API balance is funded;
- App Hosting can read Higgsfield secrets;
- a paid Higgsfield request has succeeded.

Those remain activation gates, not source-integration blockers.


## Artifact download origin gate

ASSET_FACTORY_HIGGSFIELD_ARTIFACT_ORIGINS must contain a comma-separated list of explicitly approved output origins (scheme and host, with port if applicable) before downloading provider artifacts. No origin is approved by default. Establish this list from legitimately observed provider output and rights/storage policy; do not guess CDN domains. Redirects, credential-bearing URLs and IP-literal IPv6 output URLs are rejected. Downloads are capped while streaming, including responses without Content-Length. Credentials and provider selectors remain dormant until the existing activation gates are satisfied. Offline behavior tests use synthetic responses and make no provider calls.
