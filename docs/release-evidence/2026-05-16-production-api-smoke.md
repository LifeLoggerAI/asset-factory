# Asset Factory Production API Smoke Evidence

- Environment: production
- Firebase project: urai-4dc1d
- Production API base: https://urai-4dc1d.web.app
- Branch: main
- Commit SHA: 8b83cf7e4d9317e476ba78faf1e4ae3a9abec684
- Date/time: 2026-05-16T18:34:42Z

## Smoke result

| Check | Result | Evidence |
| --- | --- | --- |
| Health | pass | PASS /api/health |
| Asset request | pass | PASS /api/assets assetId=VZ8KyeU8nuQQonM1xm9Z queueId=kpAHbM3UcwVxODOhd8pe |
| Asset status | pass | PASS /api/assets/{assetId} |
| LifeMap event ingestion | pass | PASS /api/lifemap/events eventId=7HDdDvmuCz3dTLEg3NUU |
| Production finalization smoke | pass | PASS production finalization smoke |

## Decision

- [x] Production Firebase API is live
- [x] Production authenticated API smoke accepted
- [x] Firebase default production URL accepted
- [ ] Custom domain API routing accepted
- [ ] Completion lock can be changed to LOCKED

## Notes

The production backend is live and passing authenticated smoke at https://urai-4dc1d.web.app.

The browser UI at https://uraiassetfactory.com/create is visible, but that custom domain currently routes /api/health to a separate Next.js deployment and returns 404. Keep custom-domain API routing as a separate DNS/Firebase Hosting attachment blocker.
