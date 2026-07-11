# Human creative approval receipts

A paid generation run may create technically valid output, but it does not certify or promote that output.

Before promotion, a human reviewer must inspect the generated contact sheets, every flagged item, every final asset at usable resolution, route-safe crops, text legibility, brand consistency, accessibility variants, and the absence of unwanted likeness or private-life content.

Create one receipt at `creative-review/approvals/<version>.json` using `creative-review/approval.schema.json`.

The receipt must bind the decision to:

- the exact Asset Factory commit;
- the exact rights-ledger SHA-256;
- the exact Spatial handoff-manifest SHA-256;
- every approved canonical asset path and SHA-256;
- the human reviewer identity, timestamp, and decision notes.

Do not copy an approval receipt between runs or versions. Any changed head, rights ledger, handoff manifest, asset path, or asset digest invalidates the approval.

Technical heuristic scores are review aids only. They are never human approval and cannot satisfy promotion clearance.
