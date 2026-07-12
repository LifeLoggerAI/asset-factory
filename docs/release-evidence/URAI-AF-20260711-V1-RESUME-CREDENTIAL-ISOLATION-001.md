# URAI Asset Factory V1 Resume Credential-Isolation Receipt

**Receipt ID:** `URAI-AF-20260711-V1-RESUME-CREDENTIAL-ISOLATION-001`  
**Repository:** `LifeLoggerAI/asset-factory`  
**Replacement branch:** `security/v1-resume-v3-safe-rebase-20260711`  
**Reconstructed base:** `main@6cd595344fba0fd759579789a3da795c72a12d95`  
**Exact-head binding:** this receipt is committed on the candidate head; any later branch commit supersedes its workflow evidence.  
**Verdict:** **HOLD until unchanged-head CI, independent exact-head review, merge, merged-main preflight, and separate paid authorization are complete.**

## Historical paid-run reconstruction

The fail-closed preflight covers four historical authorization commits. The two latest historical runs ended before provider generation:

- marker `4dc05a67746e189054609e405ca3801683ab5445`, run `29169591028`: authorization passed, preflight failed, generation skipped, no retained output artifact;
- marker `0cf837d585d3d1c1d8e171938037098c72230c22`, run `29170464085`: authorization passed, preflight failed, generation skipped, retained preflight artifact `8253381637`, receipt digest `sha256:94363e853adfb63c802ab0e5c2a532ad9fb393396568d98da9e964615c4b2672`.

Historical artifact `8252999073` was independently inspected:

- ZIP digest `sha256:6d6f61e9771d983320fb1881beb82523e9e202bb54db5bdbe87b37b59eb31afb`;
- six JSON manifests only;
- no generated images, budget state, forge receipt, quality report, drop-in receipt, or Spatial handoff.

No historical provider generation or provider spend is claimed.

## Retired paid entry points

The candidate removes thirteen legacy paid executors or dispatchers:

1. `.github/workflows/v1-forge-trigger.yml`;
2. `.github/workflows/v1-aaa-asset-forge.yml`;
3. `.github/workflows/patch-and-run-v1-forge.yml`;
4. `.github/workflows/canonical-version-forge.yml`;
5. `.github/workflows/owner-issue-one-paid-v1-smoke.yml`;
6. `.github/workflows/versioned-aaa-asset-forge.yml`;
7. `.github/workflows/v2-living-state-forge.yml`;
8. `.github/workflows/final-v1-avatar-extension.yml`;
9. `.github/workflows/dispatch-one-paid-v1-smoke.yml`;
10. `.github/workflows/dispatch-canonical-v2-v5-wave.yml`;
11. `.github/workflows/rerun-v1-now.yml`;
12. `.github/workflows/rerun-v2-now.yml`;
13. `.github/workflows/rerun-v3-now.yml`.

The sole remaining active paid workflow is `.github/workflows/one-time-v1-aaa-spatial-pack-safe-resume-3.yml`, reachable only through the future canonical one-file protected-main marker. That marker remains absent.

## Current paid-generation boundary

The candidate:

- uses one shared first-parent validator for direct, squash, and normal merge authorization commits;
- requires exactly one effective added marker file with canonical JSON and the expected parent SHA;
- pins provider `openai`, endpoint `https://api.openai.com/v1/images/generations`, opaque model `gpt-image-2`, and transparent model `gpt-image-1.5`;
- supplies only `OPENAI_API_KEY` as a provider secret and confines it to protected provider steps;
- enforces one attempt, at most 47 new provider calls, at most USD 1 per unit, and at most USD 47 total;
- prevents generation from directly merging, promoting, deploying, or pushing to Spatial;
- paginates every historical run, job, and artifact collection and fails closed when a safe terminal page cannot be established;
- recognizes original, marker, and safe-resume historical workflows and both legacy/current generation-step names;
- rejects generated-output artifacts, non-skipped generation, successful execute jobs, incomplete coverage, and ambiguous history.

## Artifact and archive boundary

The candidate:

- separates authenticated GitHub API access from credential-free object-storage retrieval;
- validates or rejects every redirect before reading bytes;
- bounds JSON, ZIP, member, total-size, and member-count inputs;
- rejects traversal, encryption, symlinks, non-regular entries, duplicate names, and portable Unicode/case collisions;
- extracts atomically with restrictive file modes;
- verifies producer output fields, certifier behavior, post-certification invocation, and source binding.

Superseded offline pipeline proofs contained 47 records, 17 unique image hashes, 30 repeated placeholders, and zero provider calls. They are smoke evidence only, not the final provider-backed 53-output pack, and cannot be promoted.

## Semantic paid-workflow guard

`scripts/check-paid-workflow-boundary.py` now:

- parses indentation-aware workflow mapping paths, quoted keys, inline values, and literal/folded block scalars;
- fails closed on ambiguous leading-tab indentation;
- detects scalar, mapped, and inline paid environments;
- detects quoted provider-secret keys and provider-secret expressions;
- detects provider mode and paid/provider authorization in YAML environment mappings and executable shell assignments;
- scans **all block scalars**, including both `run: |` and `actions/github-script` `script: |`, for provider-secret use and legacy paid dispatch event/workflow signatures;
- rejects known legacy filenames and differently named paid executors or dispatchers outside the v3 marker workflow.

Negative regressions cover multiline environments, inline environment maps, quoted `OPENAI_API_KEY`, exported provider secrets, inline paid/provider assignments, `script: |` legacy dispatchers, forbidden alternate marker triggers, and leading-tab YAML.

The test loader registers the imported checker in `sys.modules` before dataclass evaluation, making the regression suite compatible with Python 3.13. The corrected semantic regression suite passed locally. Exact-head GitHub execution remains the merge authority.

## Deployment and smoke boundary

The candidate:

- makes ordinary pull-request and `main` push execution verification-only;
- permits Firebase production deployment only through an explicit `workflow_dispatch` on `main`, boolean authorization, exact `DEPLOY_ASSET_FACTORY` confirmation, `asset-factory-production` environment approval, and a configured service-account secret;
- writes the service account with restrictive permissions and removes it after use;
- converts `.github/workflows/deploy-asset-factory.yml` to smoke-only with no deploy input, Firebase credential, Firebase CLI, Java setup, or deploy command;
- forces `ASSET_FACTORY_SMOKE_READONLY=true` for unauthenticated and authenticated staging/production smoke;
- forces canonical post-deploy smoke to remain read-only;
- includes both smoke implementations in deployment-boundary path triggers;
- runs `scripts/test-smoke-readonly-boundary.mjs`, which executes both smoke implementations against a local HTTP recorder and fails on any non-GET/HEAD request or access to `/api/assets`, `/api/lifemap/events`, or `/api/generate`;
- removes the stale executable `scripts/test-launch-readiness.mjs` compatibility script and its package alias.

## Exact-head evidence requirements

Before merge, one unchanged exact head must prove:

1. every required workflow succeeds;
2. every job, log, and retained artifact is inspected;
3. independent non-author review clears the exact SHA and diff;
4. the base, head, changed paths, and mergeability are reverified;
5. the exact tested SHA is merged.

After merge, merged `main` must pass the full four-marker historical preflight before any later paid marker is considered.

A later paid marker separately requires explicit billing authority, protected-environment approval, the pinned provider/model contract, the USD 47 ceiling, and continued absence of prior-spend or duplicate-generation evidence.

## Still unproven

- final exact-head workflow completion and artifact inspection;
- final independent exact-head clearance;
- merged-main four-marker preflight;
- valid paid-provider billing authority and environment approval;
- a new provider-backed 53-output pack;
- final certification, Spatial handoff, activation, deployment, or public verification.

## Mutation and spend statement

This repair changes source controls, tests, workflows, and documentation only. It does not create a paid marker, trigger paid generation, call a provider, spend funds, promote assets, push to Spatial, deploy Firebase, change billing, change credentials, change production data, or activate public assets.
