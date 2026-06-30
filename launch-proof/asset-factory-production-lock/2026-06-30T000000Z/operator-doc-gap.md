# Operator Documentation Gap

Timestamp: 2026-06-30T02:05:00-05:00

Finding: the deploy workflow and release evidence notes require a second tenant proof credential for authenticated cross-tenant smoke proof. Some older README and runbook manual command examples still show only the primary tenant credential.

Risk: an operator copying the older manual examples could run an authenticated smoke command that cannot prove cross-tenant denial. The GitHub Actions deploy workflow is stricter and remains the preferred launch path.

Safe operator rule: use `Actions -> Deploy Asset Factory -> Run workflow` for staging and production evidence. For any authenticated smoke run, configure the full credential set required by `.github/workflows/deploy-asset-factory.yml`, including the second tenant proof credential.

Status: repo-side production code remains hardened. This is an operator documentation drift item. It does not reduce route authorization, E2E lifecycle coverage, or the workflow-level secret validation gate.
