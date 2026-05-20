# Asset Factory execution note — 2026-05-20

## Completed in this pass

- Merged PR #86 into `main` as commit `0d486fc875ef2c16d52adc4970736c0633b9227e`.
- This landed the Firebase Studio deploy/runtime and API-routing fix:
  - Studio runtime aligned to Firebase-supported exact Node runtime.
  - Removed deployed-host `/api/:path*` self-rewrite from Studio Next config.
  - Kept public health lightweight and redacted.
  - Preserved full diagnostics behind protected full manifest/health checks.
  - Added deploy-readiness static guard wiring.
  - Updated root deploy script path for Studio deploy verification.

## Evidence observed before merge

- Production Readiness workflow on PR #86 completed successfully.
- CI had one failing job: `Asset Factory emulator smoke`.
- The emulator smoke failure was caused by GitHub Actions runtime setup: current `firebase-tools` requires Java 21+, while the workflow did not install Java 21 before `firebase emulators:exec`.

## Remaining immediate repo-owned CI fix

Patch `.github/workflows/ci.yml`:

- Use Node.js 22 for Studio jobs so CI matches `assetfactory-studio` runtime expectations.
- Install Java 21 before running Firebase emulators.

Suggested `studio-emulator` addition:

```yaml
      - name: Use Java 21 for Firebase emulators
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '21'
```

## Remaining production lock gates

This note does not claim Asset Factory is complete or locked. Remaining gates still include staging smoke with fallback disabled, custom-domain authenticated smoke, JWT/API-key/tenant/role proof, cross-tenant denial proof, provider-backed generation proof, queue/DLQ proof, Stripe signed webhook entitlement proof, monitoring links, legal/privacy/security/support signoff, rollback evidence, and UrAi Core dependency lock.
