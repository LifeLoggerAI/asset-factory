# R17 — Audited handoff integrity, confirmed legacy runtime boundary and fail-closed audit-tool proposal

**Observed 2026-11-08 Central / 2026-11-09 UTC. Review-only; One UrAi Genesis production HOLD.** This is additive to R14–R16 on the existing separate audit PR #497 stacked upon #496. No original media binary, protected account/provider output or current consumer deployment was materialized. No owner implementation, IAM, secrets, paid generation, production branch, merge or deployment was changed.

## 1. R16 package verified against actual local bytes

- `ONE_URAI_GENESIS_ASSET_FACTORY_R16_HANDOFF.zip`: ZIP CRC/test passed and contains 13 files. `PACKAGE_SHA256.json` names 12 other files, all **12/12 independently checked** against their exact SHA-256 and length.
- The two recovered R16 fixture suites rerun locally with paths adjusted **only in test-script copies**, not the original tools: Git-object inspector **16/16 PASS**; manifest path guard **16/16 PASS**.
- These checks are synthetic offline Git fixtures and packaging integrity, **not** full raw/decoded historical MP4, GLB, external provider custody or exact-current-device proof.

## 2. New reproduced R17 defects — synthetic fixtures, not live exploits

With the original saved `urai_asset_forensic_inspector.py` and `r15_manifest_path_guard.py`, five bounded offline observations reproduced:

1. A manifest with `assets: []` and `lodGroups: {}` is admitted by the old `tree_path_gate_pass`, due to an empty-collection equality check (vacuous truth).
2. `r15_manifest_path_guard.py --strict` reports exit **0** for that empty contract.
3. The forensic inspector accepts `--out` inside its audited source repository even though documentation promises read-only auditing.
4. The manifest path guard's lexical output-path check is bypassable by a symlink outside the repo pointing back inside it; this can cause incidental report file creation under the audited tree.
5. Path-only asset checking **does not inspect the actual GLB bytes** even if the path is present and nonzero. This last point is a documented evidence limit, not a newly discovered exploit.

**Interpretation:** these are CI/evidence-harness integrity risks if used as production evidence. None proves a present external attacker, actual altered tracked Git objects, or active production exploit.

## 3. Review-only patch and reproducible tests

A standalone `R17_PROPOSED_AUDIT_TOOL_FAIL_CLOSED_HARDENING.patch` was created **locally** against the saved R14/R15 standalone Python helpers (not deployed source). It adds:
- nonempty manifest contract requirement before the strict source-path gate can pass;
- resolved-path output checks to prevent direct and symlink-alias output into audited source trees, performed before any report write.

Patch SHA-256: `c7259c40f573d8e0c1b2622ee063d91768323253f31df5a27e7e7aa612ea8f9c` (1,994 bytes). Applied cleanly to exact original copies with `git apply --check` and `git apply`; resulting bytes matched reviewed candidate script copies.

**Fresh fixed-candidate results:**
- Original inspector suite: **16/16 PASS**, log SHA-256 `68f54b90d6614d584ad06b7475c12d5b836aed638a435a0036d58fd8062e5621`.
- Original manifest-guard suite: **16/16 PASS**, log SHA-256 `db6e642d05854134d36c48b6d468326e0606b4b63b601e0120fd62f9f1e6a18e`.
- New negative/positive regression: **11/11 PASS**, log SHA-256 `672763e2f07b8b7ac3f008600d5b32574bd0828a7a214099422550642dd23fb3`.
- No tracked/untracked source files were left behind in the fixture after successful off-repo reports.
- The patch does not add official glTF/codec validation, lock-free atomic output, hardening for every path form, or actual production integration. Owner review and further tests remain required.

## 4. UrAiProd historical runtime/source relationship

Immutable original UrAiProd `d3d7ce6e607a5ee1be2c9f9ede6eecf1cfb393b9`:
- The 73-record GLB manifest (`manifest/glb_manifest.json`) is imported through `manifest/glb_manifest.ts`, and three **root-level** `sanity-glb*` pages use manifest `lodGroups` and `UraiLod`.
- Root `package.json` delegates its build to `scripts/urai-run.mjs` and `apps/web`; actual `apps/web/package.json` invokes `next build`. `apps/web/tsconfig.json` excludes root `app`. **The root-level viewer pages therefore are not proof of an active compiled `apps/web` route.** No exact built output or live deployment was tested.
- The historical model manifest's `/models/` paths still do not match any tracked `public/models/` GLBs in the fixed tree, per R15 crosswalk. Search shows the legacy runtime auditing script filters manifest references to `/assets/urai/`, rather than checking all `/models/` URL paths. Treat this as an unverified historical artifact contract, not an approved current public asset route.
- `generate-manifest.mjs`'s original `None` reference bug and original UrAi Genesis checker's missing-assets exit 0 remain separate legacy defects; do not bypass current Spatial acceptance.

## 5. Confidential Privacy coordination

At the same frozen public UrAiProd main SHA, three files under a legacy personal-reference folder total 20,428 declared bytes. A bounded read of those three JSON documents confirmed personal/reference/provenance/Drive identifier categories and an email-like value; no private media or access grants were opened. **Do not publish any actual personal/Drive identifiers, person-specific source paths or extracted contents.**

A new **PRIVATE** Labs coordination issue #283 was created for Privacy/security to verify intent, linked sharing ACLs, and any required history-aware containment. The public audit may refer to this restricted coordination only generically; never transfer sensitive source values or infer live data access.

## 6. Release and execution limits

Factory main `a49f611ade29a1754787701ab4bf915c85c0cdc6`, owner #421 `e7d23952bcaa21209ff2d964c81c533f905863ca`, security #493 `3105353064d389373b9c792894c78e0e1171158a`, composite #494 `09fb062643cbad7cd0576fb85bb05d2db97d7d49`, and forensic base #496 `21154eb50c312a1846bcf5b229fdc7ad1a3154a0` were observed unchanged at this audit snapshot.

Current original GitHub Actions, actual provider task status, deployed Tripo V3 parity, 28 historic MP4 raw decoding, 47 legacy nonzero GLBs, eight current raw-inaccessible Spatial models, 278MB Generic World ZIP, asset provenance/rights, cross-service Privacy→Studio→Jobs→Replay→deletion, official codec/device tests, independent review and live rollback **remain unverified**.

**Disposition: R17 improves the integrity of future audit evidence. It does not promote source-only checks into production readiness. ONE URAI GENESIS HOLD.**
