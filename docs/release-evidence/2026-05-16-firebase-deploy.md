# Asset Factory Firebase Deploy Evidence

- Environment: production Firebase default hosting
- Repo: LifeLoggerAI/asset-factory
- Branch: main
- Commit SHA: 65ff732e3d02f35e6cc04cfc912cf3994cb6cac5
- Date/time: 2026-05-16T18:29:11Z
- Firebase project: urai-4dc1d
- Firebase URL: https://urai-4dc1d.web.app

## Status summary

| Area | Required value | Actual value | Evidence |
| --- | --- | --- | --- |
| Firebase deploy | pass | pass | Deploy complete |
| Firestore rules | pass | pass | firestore.rules released |
| Storage rules | pass | pass | storage.rules released |
| Hosting release | pass | pass | release complete |
| Functions | pass | pass | functions unchanged / verified |
| Firebase readonly smoke | pass | pass | PASS /api/health and read-only production finalization smoke |

## Decision

- [x] Firebase default production deploy accepted
- [x] Firebase default readonly smoke accepted
- [ ] Custom domain readonly smoke accepted
- [ ] Production authenticated smoke accepted
- [ ] Completion lock can be changed to LOCKED

## Notes

This evidence proves the Firebase default hosting deployment path and read-only smoke for https://urai-4dc1d.web.app. Custom domain, authenticated production, tenant isolation, and final lock evidence are still pending.
