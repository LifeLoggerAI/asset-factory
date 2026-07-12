# URAI Asset Factory V1 Resume Credential-Isolation Receipt

**Receipt ID:** `URAI-AF-20260711-V1-RESUME-CREDENTIAL-ISOLATION-001`  
**Repository:** `LifeLoggerAI/asset-factory`  
**Replacement branch:** `security/v1-resume-v3-safe-rebase-20260711`  
**Live main reconstructed:** `6cd595344fba0fd759579789a3da795c72a12d95`  
**Release verdict:** **HOLD — CURRENT EXACT-HEAD CI, INDEPENDENT REVIEW, MERGE, MERGED-MAIN PREFLIGHT, AND A NEW SEPARATE AUTHORIZATION ARE REQUIRED**

## Paid-run reconstruction

### Authorization `4dc05a67746e189054609e405ca3801683ab5445`

Workflow run `29169591028`:

- authorize `86588461085`: success;
- historical preflight `86588508921`: failure;
- execute `86588640540`: skipped;
- retained artifacts: none.

### Authorization `0cf837d585d3d1c1d8e171938037098c72230c22`

Workflow run `29170464085`:

- authorize `86590713138`: success;
- historical preflight `86590730386`: failure;
- execute `86590777497`: skipped;
- retained preflight artifact `8253381637`;
- receipt digest `sha256:94363e853adfb63c802ab0e5c2a532ad9fb393396568d98da9e964615c4b2672`.

Neither run entered the paid generation job. No provider generation or provider spend is claimed from either run.

## Exact preflight failure

The retained receipt from run `29170464085` proves that historical artifact `8252999073` could not be downloaded by the active checker because authenticated `curl --location` received HTTP 415 from the artifact ZIP endpoint.

The execute job remained skipped because the preflight failed closed.

## Independent historical artifact inspection

Artifact `8252999073` was downloaded through the authenticated GitHub connector and inspected separately.

- ZIP digest: `sha256:6d6f61e9771d983320fb1881beb82523e9e202bb54db5bdbe87b37b59eb31afb`;
- exactly six JSON manifest files;
- no budget state;
- no generated PNG, WebP, JPG, or JPEG;
- no forge receipt;
- no quality report;
- no drop-in receipt;
- no Spatial handoff output.

It is source/manifest evidence, not provider-generation evidence.

## Current-main collision and review corrections

While the first security branch was under review, `main` advanced and:

- removed only the proposed v3 marker;
- retained the original consumed authorization marker;
- retained the consumed v2 authorization marker;
- retained the original push-triggered paid-resume workflow;
- moved the original checker into `image_asset_generator/check_v1_safe_resume_history_core.py`;
- added a wrapper at `image_asset_generator/check_v1_safe_resume_history.py`.

The checker refactor was not a security repair: the core still executed `curl --location` while attaching `Authorization: Bearer` and GitHub API headers.

Exact head `ca81be9907c73f617ef5bb35a4f4dccd01df9f7b` passed GitHub Artifact Credential Isolation run `29170982030` and V1 Safe Resume Control Validation run `29170982029`, but an independent Codex review then identified that the original unsafe paid-resume workflow remained active. Follow-up inspection confirmed both consumed authorization markers remained. That head is superseded and cannot authorize merge.

After correcting those paths, a further full-scope inspection found the active post-certification workflow still downloaded the generated pack with authenticated `curl --location` and extracted it with generic `unzip`. That path could forward the run token across the artifact redirect and trusted archive paths and types without bounds. It is now included in this repair and in both exact-head regression gates.

## Security defects removed

1. authenticated cross-origin `curl --location` artifact retrieval in historical preflight;
2. authenticated cross-origin `curl --location` artifact retrieval in post-certification;
3. provider secrets and paid flags declared at workflow scope;
4. generic `unzip` of the trusted Home seed;
5. generic `unzip` of the complete generated pack;
6. original unsafe paid-resume workflow;
7. consumed v2 paid-resume workflow;
8. original consumed authorization marker;
9. consumed v2 authorization marker;
10. active curl-based checker wrapper and core;
11. incomplete path filters and absence assertions that allowed retired controls to survive unnoticed.

## Replacement boundary

The replacement:

- deletes the original unsafe paid-resume workflow;
- deletes consumed v2;
- deletes both consumed authorization markers;
- deletes the checker wrapper and unsafe core;
- converts post-certification artifact listing and download to the same credential-isolated helper;
- separates authenticated GitHub API access from credential-free object-storage access;
- requires HTTPS redirect targets with no embedded credentials;
- bounds JSON, ZIP, per-member, total-extracted-byte, and member-count sizes;
- performs atomic mode-0600 writes;
- extracts one unique regular seed file by basename;
- extracts the full generated pack only through canonical relative paths and regular files/directories;
- rejects directory/type mismatches, encryption, duplicates, traversal, backslash paths, drive-like paths, symlinks, non-regular files, oversized members, oversized totals, and oversized member counts;
- inspects all four historical authorization SHAs;
- treats unresolved execution, non-skipped generation, generated-output evidence, expired pack evidence, incomplete coverage, and technical errors as hard blockers;
- scopes provider secrets and paid flags only to the protected `paid-asset-generation` execute job;
- retains one attempt, 47 provider calls, USD 1 per unit, and USD 47 total hard ceilings;
- retains evidence for 365 days;
- adds executable credential, single-file extraction, full-tree extraction, and historical-preflight regression tests;
- makes both security workflows trigger on every retired workflow, consumed marker, unsafe checker, post-certification workflow, and replacement control path;
- asserts every retired workflow, consumed marker, and unsafe checker remains absent;
- statically asserts post-certification cannot restore authenticated redirect-following or generic unzip.

## Local regression proof before push

The expanded redirect and extraction regression suite completed successfully before the source update:

`PASS GitHub artifact redirect and extraction isolation`

This local proof validates the test code and helper behavior, but it does not replace GitHub exact-head workflow evidence.

## Separate authorization rule

The replacement workflow listens for:

`authorizations/execute-v1-aaa-spatial-pack-safe-resume-3-20260711.json`

That marker is absent from current main and remains absent in this repair. Merging the repair cannot trigger paid generation.

A new marker may be added only as a later one-file protected-main commit after:

1. the corrected replacement PR is terminal-green on one unchanged exact head;
2. an independent non-author security reviewer approves that exact head;
3. the repair is merged;
4. merged-main historical preflight proves all four authorization histories safe;
5. provider, model, secrets, billing authority, and the absolute USD 47 ceiling are explicitly confirmed;
6. duplicate-generation and prior-spend evidence remain absent.

The new marker schema must include all four historical authorization SHAs and the reauthorization nonce defined by the merged workflow.

## Evidence classification

Implemented source capability:

- credential-isolated artifact listing and download;
- bounded path-independent single-file extraction;
- bounded canonical full-pack extraction;
- post-certification credential and archive isolation;
- execute-job-only provider secrets;
- complete four-marker history inspection;
- executable fail-closed tests;
- separately authorized paid workflow;
- explicit retirement of both consumed workflows and markers;
- exact-path regression coverage preventing silent restoration.

Previously proven on superseded head `ca81be9907c73f617ef5bb35a4f4dccd01df9f7b`:

- GitHub Artifact Credential Isolation succeeded;
- V1 Safe Resume Control Validation succeeded.

Not yet proven for the current corrected exact head:

- current exact-head CI success;
- current exact-head independent non-author approval;
- merged-main preflight success;
- valid provider and model identity;
- any provider-backed V1 output;
- complete 53-output pack;
- certification, handoff, promotion, deployment, or public activation.

## Mutation and spend statement

This repair changes source controls and documentation only. It does not create a paid marker, rerun a paid workflow, call a media provider, spend provider funds, promote assets, deploy code, mutate secrets or billing, mutate Firebase or production data, or activate public assets.
