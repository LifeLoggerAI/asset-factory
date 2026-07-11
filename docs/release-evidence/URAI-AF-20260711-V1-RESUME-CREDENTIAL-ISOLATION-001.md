# URAI Asset Factory V1 Resume Credential-Isolation Receipt

**Receipt ID:** `URAI-AF-20260711-V1-RESUME-CREDENTIAL-ISOLATION-001`  
**Repository:** `LifeLoggerAI/asset-factory`  
**Security branch:** `security/fix-artifact-redirect-token-leak-20260711`  
**Live main inspected:** `4dc05a67746e189054609e405ca3801683ab5445`  
**Prior workflow PR:** `#187`  
**Prior workflow run:** `29169591028`  
**Security PR:** `#188`  
**Verdict:** **SOURCE REPAIRED — HOLD FOR EXACT-HEAD CI, REVIEW, MERGE, AND SEPARATE OWNER AUTHORIZATION**

## Incident and execution reconstruction

The one-time V1 safe-resume authorization commit `4dc05a67746e189054609e405ca3801683ab5445` started workflow run `29169591028`.

Observed job results:

- `authorize` job `86588461085`: successful;
- `historical-preflight` job `86588508921`: failed;
- `execute` job `86588640540`: skipped;
- workflow-run artifacts: none.

Therefore the failed run did not enter the provider-generation job and did not produce a forge artifact through that workflow. No new provider call or provider spend is claimed from run `29169591028`.

The separate post-certification workflow failed because no generated V1 pack was available. That failure is not generation evidence.

## Security finding

The consumed v2 workflow downloaded historical artifact archives through Python `urllib` automatic redirect handling while attaching the run-scoped `GITHUB_TOKEN` to the original GitHub API request.

Because the artifact API responds with a cross-origin redirect to object storage, relying on generic automatic redirect behavior created an avoidable credential-boundary risk. The required contract is:

1. authenticate only to the GitHub API endpoint;
2. refuse automatic redirects;
3. read and validate the redirect target explicitly;
4. require HTTPS and reject embedded user information;
5. create a new storage request containing no Authorization, GitHub API-version, cookie, or other credential headers;
6. enforce bounded API, archive, and extracted-file sizes;
7. write archives and extracted files atomically with owner-only permissions;
8. extract only one uniquely named regular file without trusting archive paths.

## Implemented remediation

This security branch:

- deletes the consumed `.github/workflows/one-time-v1-aaa-spatial-pack-safe-resume-2.yml` path;
- adds `scripts/github_artifact_download.py` with explicit no-redirect API handling and credential-free storage retrieval;
- rejects non-HTTPS redirects, embedded redirect credentials, malformed response sizes, oversized API responses, oversized archives, and oversized extracted members;
- atomically writes downloaded and extracted files with mode `0600`;
- extracts the proven Home seed by unique basename, ignores archive paths, and rejects duplicate basenames, directories, encrypted entries, symlinks, and non-regular file types;
- adds executable tests proving the storage request does not receive the run token and the extraction boundary rejects traversal, duplicate, symlink, and size hazards;
- adds `scripts/v1_safe_resume_preflight.py` to inspect all prior authorization SHAs, jobs, generation steps, and retained artifacts;
- treats exceptions, incomplete historical coverage, unresolved runs, executed generation steps, successful or in-progress execute jobs, generated-output evidence, and expired pack artifacts as hard blockers;
- adds behavioral tests proving skipped execution with no artifacts is safe while expired evidence, missing coverage, non-skipped generation, and generated-output artifacts block;
- adds a v3 workflow that uses the credential-isolated downloader for historical artifacts and the proven Home seed;
- keeps all provider keys, provider configuration, paid-run flags, budget paths, and spend ceilings out of authorization and history-inspection jobs;
- exposes provider secrets only inside the protected `paid-asset-generation` execute job;
- runs credential-isolation regressions before both preflight and paid execution;
- preserves one attempt, 47-provider-call, USD 1-per-unit, and USD 47-total hard ceilings;
- retains preflight and forge evidence for 365 days;
- adds a dedicated exact-head security workflow.

## Separate authorization boundary

The v3 workflow listens only for:

`authorizations/execute-v1-aaa-spatial-pack-safe-resume-3-20260711.json`

That marker is intentionally absent from this security branch. Merging the security repair cannot trigger paid generation.

A later owner-authorized marker must be a one-file commit on protected `main`, must match the exact expected v3 schema, and must be created only after:

1. this security PR is terminal-green on one unchanged head;
2. the exact diff and security tests are independently reviewed;
3. the PR is safely merged;
4. the prior failed run and all historical artifacts are re-inspected by the merged v3 preflight;
5. provider secrets, provider and model identity, billing authority, and the absolute USD 47 ceiling are explicitly confirmed;
6. duplicate generation and prior-spend evidence remain absent.

## Evidence classification

Implemented source capability:

- redirect-safe artifact retrieval;
- bounded, path-independent, regular-file-only seed extraction;
- executable credential, extraction, and historical-preflight regression tests;
- fail-closed historical spend and output inspection;
- expired pack evidence refusal;
- execute-job-only provider-secret scope;
- separately authorized v3 paid workflow.

Not yet proven:

- exact-head GitHub CI success for this security branch;
- independent security approval;
- successful merged-main v3 preflight;
- valid provider credentials and model identity;
- any provider-backed V1 output;
- complete 53-output pack;
- certification, Spatial handoff, promotion, deployment, or public activation.

## Local execution note

An attempted isolated local fetch could not resolve `raw.githubusercontent.com` because outbound DNS is disabled in the operator session. No local test result is claimed. GitHub Actions remains the authoritative execution environment for the exact branch head.

## Mutation and spend statement

This remediation created source files, tests, documentation, and a review branch only. It did not create the v3 authorization marker, rerun the consumed v2 workflow, call a media provider, spend provider funds, promote assets, deploy code, mutate secrets, billing, Firebase, or production data, or merge into `main`.

## Release rule

Do not rerun workflow `29169591028`. Do not restore v2. Do not create the v3 authorization marker until the security repair is merged and all gates above are satisfied. If any historical run, step, artifact, budget state, provider receipt, expired pack, or extraction boundary is ambiguous, the v3 preflight must stop before the paid execution job.
