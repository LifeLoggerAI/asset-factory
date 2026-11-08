# Asset Factory — worker PR and lineage reconciliation R1

**Main** `a49f611ade29a1754787701ab4bf915c85c0cdc6` remains distinct from proposed producer, security and Genesis docs. GitHub PR metadata was fetched directly on 2026-11-07; state below reflects that readback, not future events.

| PR | Current GitHub state | Source authority and significance |
| --- | --- | --- |
| #208 | MERGED | V1 single-missing `avatar_receptionist` recovery authority, capped one OpenAI call; historical receipt separated from current output custody |
| #213 | MERGED | Original V1 53/53 retained-artifact recertification script with **zero new provider calls** |
| #214 | MERGED | V3–V5 canonical path reconciliation and generated-vs-uncertified classification |
| #339 | MERGED | 12 existing Runway task GET-only retention workflow, **not** new generated pixels or final Home |
| #421 | OPEN DRAFT | Current owner/convergence source `e7d23952bcaa21209ff2d964c81c533f905863ca`, 278 changed paths from main; preserves paid spend controls and protected runtime |
| #480 | MERGED into #421 lineage | Official Tripo V3 producer and bounded account read, not `main` and not provider E2E |
| #488 | MERGED into #421 lineage | Reject premature Replicate output and non-succeeded prediction |
| #489 | MERGED into #421 lineage | GLB embedded resource boundary and repaired GPT Image supported output transport; NOT asset acceptance |
| #490 | MERGED into #421 lineage | Verify input byte preservation and actual review-copy counts |
| #491 | OPEN DRAFT | Home Gaussian retained Runway input SHA gate, without admitted media/training |
| #493 | OPEN DRAFT | Security proposal: retire legacy unauthenticated tenant JWT issuer, fail closed for legacy V1/V4, no production merge |
| #494 | OPEN DRAFT | Concrete composite of #421+#493 `09fb062643cbad7cd0576fb85bb05d2db97d7d49`, review only, no host-native full matrix |
| #495 | OPEN DRAFT | Genesis docs bootstrap `a244e8f06cffcf34db323d50c148a129e8300cf0`; this R1 audit branch **starts from that SHA** |

**No concurrent worker source paths overwritten.** This R1 branch updates only `docs/estate/` and intentionally stacks a review PR on the #495 bootstrap branch, not on #421/#494 or production. No runtime code or media is modified. The private Labs master registry #262 can consume reviewed findings via a safe link without copying private people/media, secrets or protected storage locations into public documentation.

Historical completed work must not be dismissed, but worker comments, local regressions and original CI logs are not current source acceptance if the SHA advanced. See [05_VERIFICATION_AND_EVIDENCE.md](05_VERIFICATION_AND_EVIDENCE.md).
