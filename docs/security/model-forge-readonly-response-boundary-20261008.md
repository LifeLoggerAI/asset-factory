# Model Forge read-only metadata boundary — 2026-10-08

The Model Forge GET/HEAD and the two existing Rodin status/download POST operations now parse the actual byte stream with a 65,536-byte ceiling. Invalid declared lengths, chunked oversize responses, invalid UTF-8, non-object JSON, depth above 64, more than 4,096 JSON nodes, and non-finite numbers fail closed. Redirects remain refused. The existing timeout remains active through headers, body reads and bounded read-only retries; expired admission is rechecked after awaited work, and failed reads cancel/release their reader without awaiting a stalled cancellation.

Every billable POST still delegates exactly once to the canonical protected ModelSpendClient. This change adds no approval, cash/credit ledger, reservation, provider account, paid retry, or output acceptance. HTTP/provider errors no longer echo response bodies, signed URLs, logs or arbitrary exceptions into Forge receipts or CLI output. A fixed allowlist retains the precise missing immutable-source diagnostic; uncertain spend records remain preserved by the canonical client.

Source baseline was owner92836fb386a5ecf338eb83533075f861a8bb1e2a / Forge blob47a101dc7caab9c97f18752c855134b105142069. Seventeen selected actual body/redaction laws all failed against that unmodified source. The corrected actual source passed295 tests across9 suites, including43 metadata boundary cases and the unchanged client/adapters/outcome/GLB/triangle/promotion/workflow behavior. Local clean Git fixture identity is synthetic and exists only to exercise the unchanged exact-source check; it is not an authenticated production approval.

- Baseline log SHA256:7ba03c9590a8e9ca02cf993eeb19d7d69f7daa4222f24ff9c6d3ddabd175b6e8.
- Corrected log SHA256:faa6c0c7276ef00a76360b243cc85424a5ceb4ef73d855c82a8d2d746e566611.
- Real provider requests:0. Real paid reservations:0. Spend:0.
- Exact combined native verification, deployment, independent review, provider readiness, literal asset and device acceptance remain separate requirements.
