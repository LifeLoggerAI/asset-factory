## Asset Factory – Change Management Policy v1.0

### 1. Purpose

To establish a formal process for managing and controlling changes to production systems, code, and infrastructure. This ensures stability, traceability, and minimizes the risk of service disruptions.

### 2. Scope

This policy applies to all changes to the Asset Factory production environment, including:
- Application code deployments.
- Infrastructure configuration changes (e.g., Firestore rules, Cloud Function definitions).
- Pipeline version updates.
- Model version updates.

### 3. Change Control Process

- **No Direct Production Pushes:** All changes must be deployed via an automated CI/CD pipeline. Direct changes to the production environment are strictly prohibited.
- **Pull Request (PR) Required:** All code changes must be submitted through a pull request.
- **Peer Review:** All pull requests must be reviewed and approved by at least one other engineer before being merged.
- **Version Bumping:** Any change that alters the deterministic output or API contract must be accompanied by an appropriate version bump in the pipeline or input schema.

### 4. Pipeline and Model Changes

- Any change to a generation pipeline or an underlying AI model requires a new `pipelineVersion` identifier.
- The new model version and its approval must be recorded in the `modelRegistry` collection before deployment.

### 5. Emergency Changes

In a critical incident, emergency changes may be deployed. The process is:
1. Verbal approval from the CTO or engineering lead.
2. Deploy the fix.
3. Within 24 hours, the change must be documented in a pull request and a post-mortem incident report must be created.

### 6. Documentation

- A `CHANGELOG.md` file will be maintained to document all user-facing changes.
- A `RELEASE_PROCESS.md` file will document the technical steps for deployment.