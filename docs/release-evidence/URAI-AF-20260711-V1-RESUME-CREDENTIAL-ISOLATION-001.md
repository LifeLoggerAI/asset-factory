# URAI Asset Factory V1 Resume Credential-Isolation Receipt

**Receipt ID:** `URAI-AF-20260711-V1-RESUME-CREDENTIAL-ISOLATION-001`  
**Repository:** `LifeLoggerAI/asset-factory`  
**Replacement branch:** `security/v1-resume-v3-safe-rebase-20260711`  
**Reconstructed base:** `main@6cd595344fba0fd759579789a3da795c72a12d95`  
**Verdict:** **HOLD until unchanged-head CI, independent review, merge, merged-main preflight, and separate paid authorization are complete.**

## Historical paid-run reconstruction

Four historical authorization commits are covered by the preflight. The two latest historical runs ended before generation:

- marker `4dc05a67746e189054609e405ca3801683ab5445`, run `29169591028`: authorization passed, preflight failed, generation skipped, no retained output artifact;
- marker `0cf837d585d3d1c1d8e171938037098c72230c22`, run `29170464085`: authorization passed, preflight failed, generation skipped, retained preflight artifact `8253381637` with receipt digest `sha256:94363e853adfb63c802ab0e5c2a532ad9fb393396568d98da9e964615c4b2672`.

Historical artifact `8252999073` was independently inspected:

- ZIP digest `sha256:6d6f61e9771d983320fb1881beb82523e9e202bb54db5bdbe87b37b59eb31afb`;
- six JSON manifest files only;
- no generated images, budget state, forge receipt, quality report, drop-in receipt, or Spatial handoff.

No historical provider generation or provider spend is claimed.

## Removed defects

The replacement removes or corrects:

1. unsafe cross-origin artifact retrieval;
2. over-broad provider-secret scope;
3. generic ZIP extraction;
4. consumed workflows, markers, and legacy checkers;
5. incomplete four-marker history coverage;
6. traversal, type, duplicate, portable-path, size, and member-count gaps;
7. missing Home seed metadata;
8. incomplete producer, certifier, invocation, and prompt checks;
9. marker-only authorization changes that could skip or fail guard workflows;
10. stale-run cancellation races and unrelated-run cancellation risk;
11. unvalidated secondary object-storage redirects;
12. queued old heads cancelling newer evidence through shared concurrency groups;
13. retained evidence bound to GitHub's synthetic pull-request merge commit instead of the reviewed branch head;
14. generic Release Readiness artifact names without independent clean-head attestation;
15. security checks that used the pull-request fallback runner for protected-main pushes;
16. paid endpoint and model values supplied by mutable secrets rather than the authorization marker.

## Current security and execution boundary

The current branch:

- leaves the future v3 paid marker absent;
- separates authenticated API access from credential-free storage retrieval;
- rejects unexpected redirects before reading artifact bytes;
- bounds downloads and extraction and writes files atomically;
- rejects traversal, encryption, symlinks, non-regular files, duplicate paths, portable Unicode/case collisions, and size/count violations;
- checks all four historical authorization commits and fails closed on incomplete or ambiguous evidence;
- validates a later marker-only protected-main commit as exactly one added file with exact canonical JSON and exact parent SHA;
- rejects the marker in pull requests while allowing all guard workflows to remain green for a valid marker-only protected-main push;
- pins provider `openai`, endpoint `https://api.openai.com/v1/images/generations`, opaque model `gpt-image-2`, and transparent-output model `gpt-image-1.5` in marker schema `1.1.0`;
- derives runtime provider values only from validated marker outputs;
- supplies only `OPENAI_API_KEY` as a provider secret and rejects secret endpoint, model, alternate-key, or auth-header overrides;
- confines the API key to protected provider preflight and generation steps;
- enforces one attempt, at most 47 new provider calls, at most USD 1 per unit, and at most USD 47 total;
- prevents generation from directly merging, promoting, deploying, or pushing to Spatial;
- verifies producer output fields, certifier behavior, and the post-certification invocation independently;
- isolates every workflow and cleanup job by exact candidate SHA;
- limits cleanup to older, nonterminal runs explicitly linked to the same pull request and rechecks the live head before every cancellation;
- runs pull-request verification on macOS, cleanup on Windows, and protected-main/security/deployment verification on Ubuntu;
- explicitly checks out the reviewed branch head, proves exact identity and a clean tree, and scopes retained broad-workflow artifacts to that head.

## Artifact-class boundary

Previously retained offline pipeline proofs were independently inspected:

- 47 offline records;
- 17 unique image hashes and 30 duplicate placeholder outputs;
- two runs semantically identical after timestamp fields were removed;
- provider calls executed: `0`.

These files are local/offline smoke evidence only. They are not the final provider-backed 53-output V1 Spatial pack, must not be promoted, and cannot satisfy final asset certification.

## Executable proof coverage

The branch contains executable proof for:

- credential-isolated artifact retrieval and redirect rejection;
- bounded safe extraction and portable-path collision rejection;
- exact ordered four-marker history;
- absence of retired workflows, markers, and checkers;
- canonical marker acceptance and rejection of provider, endpoint, model, parent-SHA, and extra-field mutations;
- provider-secret and provider-value confinement;
- valid marker-only push lifecycle in both guards and V1 integrity;
- post-certification source binding;
- Life Map, Focus, and Replay prompt contracts;
- exact-head checkout, clean-tree identity, SHA-scoped evidence, race-safe cleanup, and event-correct runner selection.

Previously executed regressions returned:

- `PASS GitHub artifact redirect and extraction isolation`
- `PASS default four-marker preflight regression`

The new canonical-marker regression must pass on the final unchanged GitHub head. Earlier results do not replace final evidence.

## Separate authorization rule

The future v3 marker remains absent. Merging this repair cannot itself trigger provider generation.

A later one-file protected-main marker requires:

1. every required workflow successful on one unchanged exact head;
2. every retained artifact and log inspected;
3. independent non-author clearance of that exact head;
4. merge and merged-main four-marker preflight success;
5. explicit billing and protected-environment approval under the marker-pinned provider/model contract and USD 47 ceiling;
6. continued absence of duplicate-generation or prior-spend evidence.

## Still unproven

- final exact-head CI and independent clearance;
- merged-main preflight success;
- valid paid-provider billing authority and protected-environment approval;
- a new provider-backed 53-output pack;
- final certification, Spatial handoff, activation, deployment, or public verification.

## Mutation and spend statement

This repair changes source controls and documentation only. It does not create a paid marker, trigger paid generation, call a provider, spend funds, promote assets, deploy, change billing, change production data, or activate public assets.
