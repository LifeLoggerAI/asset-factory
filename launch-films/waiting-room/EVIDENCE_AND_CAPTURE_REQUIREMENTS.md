# Waiting Room Evidence and Capture Requirements

## Exact identity

Every capture set must record:

- repository, app root and exact source SHA;
- deployed SHA and protected workflow run when footage is labeled `LIVE_VERIFIED`;
- route, query string, viewport and timestamp;
- desktop and mobile dimensions;
- console errors, failed network requests and missing-resource results;
- screenshot/video filename and SHA-256;
- evidence class and disclosure text shown in the film.

## Required Day 0 captures

| Route | Desktop | Mobile | Notes |
|---|---|---|---|
| `/home` | 1440×900 | 390×844 | Orb, entry threshold and primary navigation visible. |
| `/ground` | 1440×900 | 390×844 | Ground world must be visually authoritative; no stale flat overlay. |
| `/life-map` | 1440×900 | 390×844 | 3D canvas and star depth visible. |
| `/focus?memoryId=quiet-reset` | 1440×900 | 390×844 | Sample/reconstruction disclosure retained. |
| `/replay?memoryId=quiet-reset&manifestId=replay-recovery-thread` | 1440×900 | 390×844 | Replay controls and exit/unwind affordance visible. |
| `/mirror` | 1440×900 | 390×844 | Reflection copy readable. |
| `/passport` | 1440×900 | 390×844 | Identity/ownership copy readable. |
| `/status` | 1440×900 | 390×844 | Exact product-state language visible. |

## Crop and text-safe-area checks

- Keep critical UI, orb, title and disclosures inside the central 80% width and 80% height for 9:16 cuts.
- No disclosure may be covered by platform controls or captions.
- Minimum social-cut disclosure duration: three seconds or sufficient reading time, whichever is longer.
- Avoid tiny route text embedded in backgrounds; use separate accessible text layers.
- Verify 1:1 crops independently rather than center-cropping the 16:9 master blindly.

## Fallback requirements

- Retain a static screenshot or deterministic non-WebGL fallback for every critical route used in the film.
- A missing browser/GPU feature must not produce a blank frame.
- Offline fallback assets must be repository-stored, hash-recorded and independently reviewed before public use.

## Evidence index minimum fields

```json
{
  "shotId": "day-00-shot-02",
  "evidenceClass": "LIVE_VERIFIED",
  "sourceSha": "e2850a8b9dbd2fd11ee0197505da278322916aa0",
  "deployedSha": "e2850a8b9dbd2fd11ee0197505da278322916aa0",
  "workflowRun": 29428539402,
  "route": "/home",
  "viewport": "1440x900",
  "artifactSha256": "pending-capture",
  "disclosure": "Sample-data experience"
}
```

A `pending-capture` value blocks publication.
