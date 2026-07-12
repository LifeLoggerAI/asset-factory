# URAI Asset Factory V1 Resume Credential-Isolation Receipt

**Receipt ID:** `URAI-AF-20260711-V1-RESUME-CREDENTIAL-ISOLATION-001`  
**Repository:** `LifeLoggerAI/asset-factory`  
**Replacement branch:** `security/v1-resume-v3-safe-rebase-20260711`  
**Reconstructed base:** `main@6cd595344fba0fd759579789a3da795c72a12d95`  
**Release verdict:** **HOLD — FINAL EXACT-HEAD CI, INDEPENDENT REVIEW, MERGE, MERGED-MAIN PREFLIGHT, AND A SEPARATE PAID AUTHORIZATION ARE REQUIRED**

## Historical paid-run reconstruction

### Authorization `4dc05a67746e189054609e405ca3801683ab5445`

Workflow run `29169591028`:

- authorization succeeded;
- historical preflight failed;
- paid execute job was skipped;
- no retained output artifact exists.

### Authorization `0cf837d585d3d1c1d8e171938037098c72230c22`

Workflow run `29170464085`:

- authorization succeeded;
- historical preflight failed;
- paid execute job was skipped;
- retained preflight artifact: `8253381637`;
- receipt digest: `sha256:94363e853adfb63c802ab0e5c2a532ad9fb393396568d98da9e964615c4b2672`.

Neither run entered provider generation. No provider generation or provider spend is claimed from either run.

## Independent historical artifact inspection

Historical artifact `8252999073` was independently downloaded and inspected.

- ZIP digest: `sha256:6d6f61e9771d983320fb1881beb82523e9e202bb54db5bdbe87b37b59eb31afb`;
- exactly six JSON manifest files;
- no budget state;
- no generated PNG, WebP, JPG, or JPEG;
- no forge receipt;
- no quality report;
- no drop-in receipt;
- no Spatial handoff.

It is source/manifest evidence, not provider-generation evidence.

## Security and release-control defects removed

1. authenticated cross-origin `curl --location` retrieval in historical preflight;
2. authenticated cross-origin `curl --location` retrieval in post-certification;
3. provider secrets declared outside provider-only steps;
4. generic `unzip` of the trusted Home seed and complete generated pack;
5. the original unsafe and consumed v2 paid-resume workflows;
6. both consumed authorization markers and the curl-based checker wrapper/core;
7. incomplete three-marker default history;
8. archive traversal, type, duplicate, Unicode/case-fold collision, size, and member-count gaps;
9. extraction of the Home PNG without its required provider metadata sidecar;
10. stale integrity validation against the deleted legacy workflow;
11. GitHub-expression, token-substring, and retired-filename false positives in static controls;
12. producer fields accepted merely because the certifier mentioned the same names;
13. no proof that the post-certification workflow invoked the exact certifier and arguments;
14. broad PR workflows without latest-head concurrency and one shared exact-head trigger;
15. future v3 marker changes outside both independent guard path filters;
16. legacy queued PR runs created before concurrency controls;
17. an initial stale-run cleanup race that trusted event SHA without checking the live PR head;
18. stale-run cancellation without mandatory explicit linkage to the same PR;
19. object-storage retrieval using default `urlopen`, allowing an unvalidated secondary redirect after GitHub's validated redirect.

## Replacement security and queue boundary

The replacement:

- deletes both unsafe/consumed paid-resume workflows, both consumed markers, and the unsafe checker files;
- leaves the future v3 authorization marker absent;
- separates the authenticated GitHub API request from a credential-free storage request;
- uses the same no-redirect opener for both requests;
- validates the GitHub-provided redirect as HTTPS, with a hostname and no user information;
- rejects any secondary redirect from object storage before reading artifact bytes;
- sends no Authorization, API-version, cookie, or GitHub-specific credential header to storage;
- bounds JSON, ZIP, per-member, total-extracted-byte, and member-count sizes;
- performs atomic mode-0600 writes;
- extracts the Home PNG and required `.render.json` sidecar as unique regular files;
- extracts full packs only through canonical relative paths and regular files/directories;
- rejects traversal, backslashes, drive-like paths, encryption, symlinks, non-regular files, exact duplicates, portable Unicode/case-fold collisions, and size/count violations;
- inspects all four historical authorization SHAs through explicit arguments and CLI defaults;
- treats unresolved execution, non-skipped generation, generated-output evidence, incomplete coverage, expired evidence, and technical errors as hard blockers;
- confines provider secrets to provider preflight and generation steps inside protected `paid-asset-generation`;
- keeps checkout, history inspection, tests, artifact download, and dependency installation free of provider credentials;
- enforces one attempt, 47 provider calls, USD 1 per unit, and USD 47 total ceilings;
- retains paid-run evidence for 365 days;
- prevents direct Spatial pushes, PR merges, auto-merge, promotion, or deployment from the paid workflow;
- verifies exporter fields, certifier behavior, and the exact post-certification invocation independently;
- gives every required release workflow a stable PR/ref concurrency group with `cancel-in-progress: true`;
- uses this receipt path as the shared pull-request trigger for every path-filtered release gate;
- includes the future v3 marker path in both guard workflows for pull requests and protected-main pushes;
- adds a same-repository stale-run cleanup with only `actions: write` and `contents: read`, no checkout and no external actions;
- makes cleanup a no-op unless live repository, branch, event SHA, run SHA, and live PR SHA agree;
- cancels only older, nonterminal, pull-request-event runs explicitly linked to the same PR and created before the cleanup run;
- revalidates the live PR head before every cancellation and aborts immediately if it changes;
- excludes the current run/SHA, completed runs, push runs, forks, other branches/PRs, newer-created runs, and stale cleanup events.

## Executable regression coverage

The branch includes executable proof for:

- authenticated API requests that reject redirects except the single validated artifact handoff;
- credential-free storage requests;
- rejection of non-HTTPS, userinfo-bearing, and secondary storage redirects;
- JSON and archive byte ceilings;
- safe single-member and full-tree extraction;
- traversal, symlink, encrypted, duplicate, portable-collision, and oversized archive rejection;
- exact ordered four-marker history and complete four-run inspection;
- absence of retired workflows, markers, and checkers;
- provider-secret confinement to exactly two provider-only steps;
- safe post-certification handling and exact exporter/certifier/invocation binding;
- explicit Life Map `no ground`, `no orb`, and `no avatar` contracts;
- latest-head concurrency, a shared exact-head trigger, marker-only v3 guard coverage, and race-safe same-PR cleanup.

Previously executed source regressions returned:

- `PASS GitHub artifact redirect and extraction isolation`
- `PASS default four-marker preflight regression`

Those earlier results validate the test implementation but do not replace final unchanged-head GitHub evidence.

## Review and workflow repair record

Independent review and exact-head execution identified and corrected:

- surviving unsafe workflows and consumed markers;
- incomplete default history;
- portable archive collisions;
- missing Home seed metadata;
- provider-secret over-scoping;
- stale exporter/certifier/invocation assertions;
- missing marker-only v3 guard triggers;
- missing latest-head concurrency and shared receipt triggers;
- stale-run cleanup PR-linkage and execution-order races;
- unvalidated object-storage secondary redirects.

The current helper rejects secondary storage redirects with the no-redirect opener, and the executable suite includes a storage-to-storage redirect case that must fail without writing an output file. The static security gate also requires the no-redirect storage call and forbids returning to default `urlopen` for the storage request.

Every repair changes the candidate SHA. Earlier workflow conclusions, artifacts, and review requests are stale and cannot authorize merge.

## Separate authorization rule

The replacement paid workflow listens only for:

`authorizations/execute-v1-aaa-spatial-pack-safe-resume-3-20260711.json`

That marker remains absent. Merging this repair cannot trigger provider generation.

A new marker may be added only as a later one-file protected-main commit after:

1. every required workflow succeeds on one unchanged exact head;
2. every retained artifact and receipt is inspected;
3. an independent non-author security reviewer clears that exact head;
4. the repair is merged;
5. merged-main historical preflight proves all four authorization histories safe;
6. provider, model, credentials, billing authority, protected-environment approval, and the USD 47 ceiling are explicitly confirmed;
7. duplicate-generation and prior-spend evidence remain absent.

## Not yet proven

- final exact-head success across every required workflow;
- final exact-head independent non-author clearance;
- merged-main preflight success;
- valid paid provider credentials and billing authority;
- any new provider-backed V1 output;
- the complete 53-output pack;
- final certification and Spatial handoff;
- Spatial activation, deployment, or public verification.

## Mutation and spend statement

This repair changes source controls and documentation only. It does not create a paid marker, trigger a paid workflow, call a media provider, spend provider funds, promote assets, deploy code, mutate secrets or billing, mutate Firebase or production data, or activate public assets.
