# Release Checklist

- [ ] Install dependencies in all active packages.
- [ ] Engine tests pass: `cd engine && npm test`.
- [ ] LifeMap functions compile: `cd life-map-pipeline/functions && npm run build`.
- [ ] Verify no secrets are committed.
- [ ] Verify `.env` values are set in deployment targets.
- [ ] Validate Firebase project/region/runtime settings.
- [ ] Smoke-test engine `POST /v1/jobs` and `GET /v1/jobs/:id`.
- [ ] Confirm rollback plan and artifact retention.
