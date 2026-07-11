# URAI Asset Factory V1 Resume Credential-Isolation Receipt

**Receipt ID:** `URAI-AF-20260711-V1-RESUME-CREDENTIAL-ISOLATION-001`  
**Repository:** `LifeLoggerAI/asset-factory`  
**Replacement branch:** `security/v1-resume-v3-safe-rebase-20260711`  
**Live main reconstructed:** `6cd595344fba0fd759579789a3da795c72a12d95`  
**Release verdict:** **HOLD — EXACT-HEAD CI, INDEPENDENT REVIEW, MERGE, MERGED-MAIN PREFLIGHT, AND A NEW SEPARATE AUTHORIZATION ARE REQUIRED**

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

## Current-main collision review

While the first security branch was under review, `main` advanced and:

- removed the consumed v3 marker;
- moved the original checker into `image_asset_generator/check_v1_safe_resume_history_core.py`;
- added a wrapper at `image_asset_generator/check_v1_safe_resume_history.py`.

The marker removal is preserved. The checker refactor is not a security repair: the core still executes `curl --location` while attaching `Authorization: Bearer` and GitHub API headers. The replacement therefore removes both wrapper and unsafe core.

## Security defects removed

1. authenticated cross-origin `curl --location` artifact retrieval;
2. provider secrets and paid flags declared at workflow scope;
3. generic `unzip` of the trusted Home seed;
4. consumed v2 workflow;
5. active curl-based checker wrapper and core.

## Replacement boundary

The replacement:

- preserves the already-removed paid marker;
- deletes consumed v2;
- deletes the checker wrapper and unsafe core;
- keeps post-certification implementation untouched;
- separates authenticated GitHub API access from credential-free storage access;
- requires HTTPS redirect targets with no embedded credentials;
- bounds JSON, ZIP, and extracted-member sizes;
- performs atomic mode-0600 writes;
- extracts one unique regular file by basename and rejects directory, encrypted, duplicate, symlink, non-regular, and oversized entries;
- inspects all four historical authorization SHAs;
- treats unresolved execution, non-skipped generation, generated-output evidence, expired pack evidence, incomplete coverage, and technical errors as hard blockers;
- scopes provider secrets and paid flags only to the protected `paid-asset-generation` execute job;
- retains one attempt, 47 provider calls, USD 1 per unit, and USD 47 total hard ceilings;
- retains evidence for 365 days;
- adds executable credential, extraction, and historical-preflight regression tests.

## Separate authorization rule

The replacement workflow listens for:

`authorizations/execute-v1-aaa-spatial-pack-safe-resume-3-20260711.json`

That marker is absent from current main and remains absent in this repair. Merging the repair cannot trigger paid generation.

A new marker may be added only as a later one-file protected-main commit after:

1. the replacement PR is terminal-green on one unchanged head;
2. an independent non-author security reviewer approves;
3. the repair is merged;
4. merged-main historical preflight proves all four authorization histories safe;
5. provider, model, secrets, billing authority, and the absolute USD 47 ceiling are explicitly confirmed;
6. duplicate-generation and prior-spend evidence remain absent.

The new marker schema must include all four historical authorization SHAs and the reauthorization nonce defined by the merged workflow.

## Evidence classification

Implemented source capability:

- credential-isolated artifact retrieval;
- bounded path-independent extraction;
- execute-job-only provider secrets;
- complete four-marker history inspection;
- executable fail-closed tests;
- separately authorized paid workflow.

Not yet proven:

- exact-head CI success for the replacement branch;
- independent non-author approval;
- merged-main preflight success;
- valid provider and model identity;
- any provider-backed V1 output;
- complete 53-output pack;
- certification, handoff, promotion, deployment, or public activation.

## Mutation and spend statement

This repair changes source controls and documentation only. It does not create a paid marker, rerun a paid workflow, call a media provider, spend provider funds, promote assets, deploy code, mutate secrets or billing, mutate Firebase or production data, or activate public assets.
