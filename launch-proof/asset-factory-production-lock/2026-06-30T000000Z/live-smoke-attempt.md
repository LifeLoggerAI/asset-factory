# Live Smoke Attempt

Timestamp: 2026-06-30T02:20:00-05:00

## Attempted read-only endpoints

- https://urai-4dc1d.web.app/api/health
- https://urai-4dc1d.web.app/api/system/health
- https://uraiassetfactory.com/api/health
- https://uraiassetfactory.com/api/system/health
- https://www.uraiassetfactory.com/api/health
- https://www.uraiassetfactory.com/api/system/health

## Result

The execution container could not resolve these hostnames at DNS level. Each request returned curl error 6, could not resolve host, with HTTP 000.

## Interpretation

This is not product-down evidence and does not close any live smoke gate. It records that this assistant execution environment cannot perform the public endpoint smoke directly.

## Required next evidence

Use the GitHub Actions deploy workflow or an operator shell with DNS/network access and the required staging or production credentials. Attach successful workflow artifacts to issue 63 before changing the completion lock from NOT LOCKED to LOCKED.
