# Asset Factory Final Firebase Verification Evidence

- Environment: production Firebase default hosting
- Repo: LifeLoggerAI/asset-factory
- Branch: main
- Commit SHA: 9ca766a2e6be7e9522d918c33d156676836796f0
- Date/time: 2026-05-16T20:13:46Z
- Firebase project: urai-4dc1d
- Verified API base: https://urai-4dc1d.web.app

## Commands

```bash
npm run deploy:firebase
npm run deploy:verify-readonly
npm run deploy:verify
npm run check:deploy-workflow
```

## Result

| Check | Result | Evidence |
| --- | --- | --- |
| Firebase deploy | pass | Deploy complete |
| Hosting URL | pass | https://urai-4dc1d.web.app |
| Read-only smoke | pass | PASS /api/health; PASS read-only production finalization smoke |
| Authenticated smoke | pass | PASS /api/health; PASS /api/assets assetId=S8DxCNxDLkT4LPmF3ZwV queueId=YpdVatSJNkFJbhJOJquL; PASS /api/assets/{assetId}; PASS /api/lifemap/events eventId=4kt6dYK6BkTsUnhkg3OD |
| Production finalization smoke | pass | PASS production finalization smoke |
| Deploy workflow static checks | pass | PASS deploy workflow static checks |

## Decision

- [x] Firebase default production deployment accepted
- [x] Firebase default read-only smoke accepted
- [x] Firebase default authenticated smoke accepted
- [x] Deploy workflow static checks accepted
- [ ] Custom domain API routing accepted
- [ ] Completion lock can be changed to LOCKED

## Notes

This evidence verifies Asset Factory on the Firebase default production API base, https://urai-4dc1d.web.app.

It does not close the custom-domain API blocker for https://uraiassetfactory.com/api/* or https://www.uraiassetfactory.com/api/*.
