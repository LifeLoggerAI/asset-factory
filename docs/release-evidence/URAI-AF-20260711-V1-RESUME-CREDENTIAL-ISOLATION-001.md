# URAI Asset Factory V1 Resume Credential-Isolation Receipt

**Receipt ID:** `URAI-AF-20260711-V1-RESUME-CREDENTIAL-ISOLATION-001`  
**Repository:** `LifeLoggerAI/asset-factory`  
**Replacement branch:** `security/v1-resume-v3-safe-rebase-20260711`  
**Reconstructed base:** `main@6cd595344fba0fd759579789a3da795c72a12d95`  
**Release verdict:** **HOLD — FINAL EXACT-HEAD CI, INDEPENDENT REVIEW, MERGE, MERGED-MAIN PREFLIGHT, AND A SEPARATE PAID AUTHORIZATION ARE REQUIRED**

## Historical paid-run reconstruction

Authorization `4dc05a67746e189054609e405ca3801683ab5445`, run `29169591028`:

- authorization succeeded;
- historical preflight failed;
- paid execute job was skipped;
- no retained output artifact exists.

Authorization `0cf837d585d3d1c1d8e171938037098c72230c22`, run `29170464085`:

- authorization succeeded;
- historical preflight failed;
- paid execute job was skipped;
- retained preflight artifact `8253381637`;
- receipt digest `sha256:94363e853adfb63c802ab0e5c2a532ad9fb393396568d98da9e964615c4b2672`.

Neither run entered provider generation. No provider generation or provider spend is claimed.

## Independent historical artifact inspection

Artifact `8252999073` was independently downloaded and inspected.

- ZIP digest `sha256:6d6f61e9771d983320fb1881beb82523e9e202bb54db5bdbe87b37b59eb31afb`;
- exactly six JSON manifest files;
- no budget state, generated image, forge receipt, quality report, drop-in receipt, or Spatial handoff.

It is source/manifest evidence, not provider-generation evidence.

## Security and release-control defects removed

1. authenticated cross-origin redirect following in historical and post-certification artifact retrieval;
2. provider secrets outside provider-only steps;
3. generic ZIP extraction of the seed and generated pack;
4. unsafe/consumed paid workflows, consumed markers, and curl-based checkers;
5. incomplete default history coverage;
6. archive traversal, type, duplicate, portable-collision, size, and count gaps;
7. missing Home seed metadata sidecar;
8. stale or incomplete exporter, certifier, invocation, and prompt assertions;
9. GitHub-expression and static-check false positives;
10. future v3 marker changes outside both independent guard filters;
11. broad PR workflows without one shared exact-head trigger;
12. cleanup without mandatory same-PR linkage or live-head race protection;
13. credential-free object storage allowed to follow an unvalidated secondary redirect;
14. cleanup's Actions-write GitHub API calls used default redirect-following;
15. PR-level concurrency groups allowed an older queued workflow to enter later and cancel newer-head evidence before jobs began.

## Replacement security boundary

The replacement:

- deletes unsafe/consumed workflows, markers, and checker files;
- leaves the future v3 marker absent;
- separates authenticated GitHub API access from credential-free storage access;
- uses a no-redirect opener for GitHub API, object storage, and cleanup API/cancel requests;
- validates the single GitHub artifact handoff as HTTPS with a hostname and no user information;
- rejects any secondary object-storage redirect before reading bytes;
- sends no Authorization, API-version, cookie, or GitHub credential header to storage;
- bounds JSON, ZIP, member, total, and member-count sizes and performs atomic mode-0600 writes;
- safely extracts the Home PNG plus required render metadata and complete canonical packs;
- rejects traversal, backslashes, drive-like paths, encryption, symlinks, non-regular types, duplicates, and Unicode/case-fold collisions;
- inspects all four authorization histories explicitly and by CLI default;
- fails closed on unresolved execution, non-skipped generation, generated-output evidence, incomplete/expired evidence, or technical errors;
- confines provider credentials to preflight/generation inside protected `paid-asset-generation`;
- enforces one attempt, 47 provider calls, USD 1 per unit, and USD 47 total;
- prevents direct Spatial pushes, merge, auto-merge, promotion, or deployment from generation;
- verifies producer fields, certifier behavior, and the exact post-certification invocation separately;
- uses this receipt as the shared pull-request trigger for every path-filtered release gate;
- keys every required workflow and cleanup concurrency group by exact candidate SHA, preventing stale executions from cancelling newer-head evidence;
- uses explicit cleanup for older heads instead of cross-SHA concurrency cancellation;
- limits cleanup to same-repository, explicitly same-PR, older-created, older-SHA, nonterminal pull-request runs;
- validates live repository, branch, event/run/live SHA agreement, rechecks live head before every cancel, and aborts on any head change;
- excludes current-head/current-run, completed, push, fork, other-branch, other-PR, newer-created, and unlinked runs.

## Executable regression coverage

The branch proves:

- API redirects are rejected except the one validated artifact handoff;
- storage requests contain no credentials and reject secondary redirects;
- JSON/archive byte ceilings and safe single-member/full-tree extraction;
- traversal, symlink, encrypted, duplicate, portable-collision, and oversized archive rejection;
- exact ordered four-marker history and complete four-run inspection;
- retirement of unsafe workflows/markers/checkers;
- provider-secret confinement to exactly two provider-only steps;
- post-certification handling and exporter/certifier/invocation binding;
- Life Map, Focus, and Replay spatial prompt contracts;
- marker-only v3 guard coverage;
- exact-SHA workflow isolation and race-safe same-PR cleanup.

Previously executed source regressions returned:

- `PASS GitHub artifact redirect and extraction isolation`
- `PASS default four-marker preflight regression`

Earlier results validate the test code but do not replace final unchanged-head GitHub evidence.

## Review and workflow repair record

Independent review and exact-head execution identified and corrected all defects listed above. In particular:

- the artifact helper now uses the no-redirect opener for storage and rejects any second hop;
- the regression suite attempts a storage-to-storage redirect and requires failure without creating an output file;
- the static gate requires `opener.open(storage_request)`, requires the explicit storage-redirect error, and forbids default `urlopen` for storage;
- cleanup requires explicit PR linkage, live-head agreement, creation ordering, and no-redirect GitHub API calls;
- every workflow group includes the exact head SHA, so out-of-order runner assignment cannot cancel current evidence.

Every source repair changes the candidate SHA. Earlier workflow conclusions, artifacts, and reviews are stale and cannot authorize merge.

## Separate authorization rule

The paid workflow listens only for:

`authorizations/execute-v1-aaa-spatial-pack-safe-resume-3-20260711.json`

That marker is absent. Merging this repair cannot trigger provider generation.

A later one-file protected-main marker requires:

1. every required workflow successful on one unchanged exact head;
2. every retained artifact and log inspected;
3. independent non-author clearance of that exact head;
4. merge and merged-main four-marker preflight success;
5. explicit provider, model, credentials, billing, protected-environment, and USD 47 authorization;
6. continued absence of duplicate-generation or prior-spend evidence.

## Not yet proven

- final exact-head success and independent clearance;
- merged-main preflight success;
- valid paid credentials/billing authority;
- any new provider-backed output or complete 53-output pack;
- final certification, Spatial handoff, activation, deployment, or public verification.

## Mutation and spend statement

This repair changes source controls and documentation only. It does not create a paid marker, trigger paid generation, call a provider, spend funds, promote assets, deploy, mutate secrets/billing/production data, or activate public assets.
