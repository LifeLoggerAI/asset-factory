# AAA package readiness reconciliation

This is a derived, local audit of exactly AAA-001 through AAA-050. It does not replace the [Final Asset Lock Master](https://docs.google.com/spreadsheets/d/10l8UZ0mi_DrrhZU-fgAfiv2i4F0Vuqd3bvEKriudp1Y/edit), authorize spending, or certify visual acceptance.

`procurement-source-snapshot.json` preserves six bounded, read-only sheet reads, including all 50 procurement rows. `source-crosswalk.json` maps those rows to directly related source, model IDs and specification IDs. `readiness-ledger.json` records the resulting per-package requirements, candidate identity, runtime/source evidence, provider selection, formats, budget requirements, LOD/device/accessibility requirements, dependencies and explicit unknowns.

The ledger separates required budgets from measured values, source presence from runtime verification, and historical approvals from current candidate acceptance. Every package remains `NOT_CERTIFIED_BY_THIS_AUDIT`. This means this audit did not establish final acceptance, not that every implementation is absent.

## Reproduce and check

Run from the Asset Factory checkout, with the Spatial repository available:

```bash
python3 scripts/reconcile-aaa-procurement.py \
  --spatial-repo ../spatial \
  --spatial-ref 8e72660754f54b3ccec7a694def29c2ed2091f8d \
  --factory-ref 71f0400ace41aa9d7b2b88e8573b0f2c2b2b6a04

python3 scripts/reconcile-aaa-procurement.py \
  --spatial-repo ../spatial \
  --spatial-ref 8e72660754f54b3ccec7a694def29c2ed2091f8d \
  --factory-ref 71f0400ace41aa9d7b2b88e8573b0f2c2b2b6a04 --check
```

Use a newly inspected exact commit when intentionally refreshing this audit. `--check` rejects differences in source identity, snapshot/crosswalk hashes, row set, or generated readiness values. Uncommitted files are excluded. The pinned Spatial commit is a local successor; this audit does not claim it is deployed or change the remote dependency authority.

## Findings

| Finding | Consequence |
| --- | --- |
| 50 procurement rows say NOT SPENT; all 11 vendor lanes say UNSELECTED | Paid completion/provider selection is not established by this register. Account funding is a separate fact. |
| 31 package rows have directly mapped source files; 19 have no implementation established within this limited checkout audit | Source presence is evidence only. External properties, professional QA services and final deliveries require their own inspection. |
| Home's historical promotion binds a different binary hash than the current replacement candidate | Do not reuse the old approved flags for the current Home binary. The current rehearsal has human/visual approval false. |
| August's brand matrix calls model/sensory families certified; current launch-critical manifest has 19 pending-review and 8 supporting-reference entries | Historical certification cannot certify the current candidate estate. |
| Retained canopy, Memory Star, Focus chamber and Passport room GLBs have restricted/reference roles | A file's existence is not permission to restore it as current visual authority. |
| Current Jacaranda receipt explicitly records an integrated candidate awaiting acceptance | Keep its visual/human/exact-head acceptance flags false until actual review provides new evidence. |
| AAA-011's Paid Trigger cell contains runtime/Focus checkpoint text | Preserve the source cell; do not treat that prose as spending authorization. |
| Model Forge checkpoint is 1b14dcbd…; inspected local Spatial commit is 8e726607… | Local source auditing does not silently renew paid execution or historical proof. |

The reference set includes 12 hero specifications, 20 audio/motion/VFX specifications, 28 Gold Master gate definitions and 16 dispatch packets. These are requirements, not completed acceptance receipts.

Outstanding evidence is explicitly unknown: final provider selection and budget, delivered LOD sets, measured GPU/frame/device performance, current exact-head literal pixels, independent acceptance, and deployed-revision equivalence. No new speculative specifications or external writes were made.
