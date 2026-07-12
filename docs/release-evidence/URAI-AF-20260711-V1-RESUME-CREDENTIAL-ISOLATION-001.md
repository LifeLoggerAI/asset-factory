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

## Security defects removed

1. authenticated cross-origin `curl --location` artifact retrieval in historical preflight;
2. authenticated cross-origin `curl --location` artifact retrieval in post-certification;
3. provider secrets declared outside provider-only steps;
4. generic `unzip` of the trusted Home seed;
5. generic `unzip` of the complete generated pack;
6. the original unsafe paid-resume workflow;
7. the consumed v2 paid-resume workflow;
8. both consumed authorization markers;
9. the curl-based checker wrapper and core;
10. incomplete three-marker default history;
11. archive traversal, type, duplicate, Unicode/case-fold collision, size, and member-count gaps;
12. extraction of the Home PNG without its required provider metadata sidecar;
13. stale integrity validation against the deleted legacy workflow;
14. static assertions that were altered by GitHub expression expansion;
15. a forbidden-token substring check that falsely rejected the safe `${URAI_WHEEL_GITHUB_TOKEN:-}` emptiness guard;
16. a retired-checker filename assertion that conflicted with intentional trigger-path coverage;
17. integrity checks that could accept producer fields merely because the certifier mentioned the same field names;
18. integrity checks that did not prove the post-certification workflow actually invoked the certifier with the exact source and output arguments.

## Replacement security boundary

The replacement:

- deletes both unsafe/consumed paid-resume workflows;
- deletes both consumed authorization markers;
- deletes the unsafe checker wrapper and core;
- leaves the future v3 authorization marker absent;
- separates authenticated GitHub API access from credential-free object-storage access;
- rejects non-HTTPS redirects and redirect URLs containing user information;
- bounds JSON, ZIP, per-member, total-extracted-byte, and member-count sizes;
- performs atomic mode-0600 writes;
- extracts the Home PNG and required `.render.json` metadata as unique regular files from the same retained archive;
- extracts complete packs only through canonical relative paths and regular files/directories;
- rejects traversal, backslashes, drive-like paths, encryption, symlinks, non-regular files, exact duplicates, portable Unicode/case-fold collisions, and size/count violations;
- inspects all four historical authorization SHAs through explicit arguments and CLI defaults;
- treats unresolved execution, non-skipped generation, generated-output evidence, incomplete coverage, expired evidence, and technical errors as hard blockers;
- confines provider secrets to the provider preflight and generation steps inside the protected `paid-asset-generation` job;
- keeps checkout, history inspection, tests, artifact download, and dependency installation free of provider credentials;
- enforces one attempt, 47 provider calls, USD 1 per unit, and USD 47 total ceilings;
- retains evidence for 365 days;
- prevents direct Spatial pushes, PR merges, auto-merge, promotion, or deployment from the paid workflow;
- verifies the handoff exporter itself emits every file, metadata, decoded-pixel, and source-binding field before paid execution;
- verifies the post-certification workflow invokes the exact certifier with generated-pack root, workflow conclusion, run ID, source head, artifact ID, and canonical report output.

## Executable regression coverage

The branch includes executable tests for:

- authenticated API requests that do not follow redirects;
- credential-free storage requests;
- HTTPS/no-userinfo redirect validation;
- JSON and archive size ceilings;
- safe single-member extraction;
- safe complete-tree extraction;
- traversal, symlink, encrypted, duplicate, portable-collision, and oversized archive rejection;
- exact ordered four-marker default history;
- complete four-run historical inspection;
- absence of retired workflows, markers, and checkers;
- provider-secret confinement to exactly two provider-only steps;
- safe post-certification artifact handling;
- V1 integrity against the v3 control rather than the retired legacy workflow;
- separate producer-field, certifier-behavior, and post-workflow invocation binding;
- explicit Life Map `no ground`, `no orb`, and `no avatar` prompt contract for desktop and mobile.

Local executable regressions previously returned:

- `PASS GitHub artifact redirect and extraction isolation`
- `PASS default four-marker preflight regression`

Local results validate the test implementation but do not substitute for unchanged exact-head GitHub evidence.

## Workflow-regression and independent-review repair record

The corrected candidate exposed additional control-test defects rather than provider/runtime defects:

- Artifact Credential Isolation and Safe Resume Validation embedded literal secret expressions inside their own `run:` scripts, allowing GitHub expression expansion to alter the text under inspection. The assertions now construct those markers at Python runtime without embedding a literal expression token in the workflow command.
- V1 AAA Spatial Pack Integrity initially inspected the deleted legacy workflow. It now inspects v3 and asserts all retired controls remain absent.
- Integrity then falsely matched the safe shell emptiness guard as a YAML secret assignment. It now uses a line-anchored YAML-key check.
- Artifact Credential Isolation then rejected the retired checker filename even though that filename is intentionally retained in trigger coverage. It now rejects executable invocations only.
- Integrity was updated to inspect the executable post-certifier after post-certification logic moved out of YAML.
- Both Life Map prompts now state the required exclusions literally so paid preflight cannot diverge from product canon.
- Independent review identified that exporter fields must be verified in the exporter itself rather than through a combined source string; the producer assertions are now separate.
- Independent review identified that the post workflow must be proven to invoke the certifier; the exact command and all source/output arguments are now asserted.

Every repair changes the candidate SHA. Earlier workflow conclusions and review requests are stale and cannot authorize merge.

## Separate authorization rule

The replacement workflow listens only for:

`authorizations/execute-v1-aaa-spatial-pack-safe-resume-3-20260711.json`

That marker remains absent. Merging this repair cannot trigger provider generation.

A new marker may be added only as a later one-file protected-main commit after:

1. every required workflow succeeds on one unchanged exact head;
2. every retained artifact and receipt is inspected;
3. an independent non-author security reviewer approves that exact head;
4. the repair is merged;
5. merged-main historical preflight proves all four authorization histories safe;
6. provider, model, credentials, billing authority, protected-environment approval, and the USD 47 ceiling are explicitly confirmed;
7. duplicate-generation and prior-spend evidence remain absent.

## Not yet proven

- final exact-head success across every required workflow;
- final exact-head independent non-author approval;
- merged-main preflight success;
- valid paid provider credentials and billing authority;
- any new provider-backed V1 output;
- the complete 53-output pack;
- final certification and Spatial handoff;
- Spatial activation, deployment, or public verification.

## Mutation and spend statement

This repair changes source controls and documentation only. It does not create a paid marker, trigger a paid workflow, call a media provider, spend provider funds, promote assets, deploy code, mutate secrets or billing, mutate Firebase or production data, or activate public assets.
