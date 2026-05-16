# Asset Factory Custom Domain Blocker

- Environment: production
- Firebase project: urai-4dc1d
- Working Firebase URL: https://urai-4dc1d.web.app
- Intended custom domain: https://uraiassetfactory.com
- Date/time: 2026-05-16T18:33:12Z

## Result

| Check | Result | Evidence |
| --- | --- | --- |
| Firebase default API health | pass | https://urai-4dc1d.web.app/api/health passed smoke |
| Custom domain API health | fail | https://uraiassetfactory.com/api/health returned Next.js 404 |
| www custom domain API health | fail | https://www.uraiassetfactory.com/api/health returned ECONNRESET |
| Firebase site attachment | fail | firebase hosting site urai-4dc1d has no listed custom domain |

## Diagnosis

The Asset Factory Firebase hosting site is live at https://urai-4dc1d.web.app, but uraiassetfactory.com is routed to a separate Next.js deployment target and does not use the Firebase Hosting rewrites in this repo.

## Required fix

Attach uraiassetfactory.com to the Firebase Hosting site urai-4dc1d or update DNS/provider routing so /api/* reaches the Firebase Hosting site with Asset Factory rewrites.

## Decision

- [x] Firebase default production URL live
- [x] Firebase default API smoke accepted
- [ ] Custom domain API smoke accepted
- [ ] www custom domain smoke accepted
- [ ] Completion lock can be changed to LOCKED
