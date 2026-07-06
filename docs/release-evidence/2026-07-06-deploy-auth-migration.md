# Asset Factory deploy authentication migration

Date: 2026-07-06

Status: IMPLEMENTED BUT NOT DEPLOYED

The canonical manual deploy workflow was changed from a legacy CLI-token path to application-default credentials supplied by the protected GitHub environment.

The workflow now records the exact commit, validates the temporary credential document, limits its file permissions, deploys without a token argument, removes the temporary file during cleanup, and records the authentication mode in its evidence summary.

The static workflow checker was updated to require this path and reject restoration of the legacy token variable.

This source change does not prove that staging or production credentials are configured and does not authorize deployment.

Required proof before promotion:

1. static workflow validation passes;
2. exact-head CI passes;
3. staging read-only smoke passes;
4. staging deploy and authenticated two-tenant smoke pass;
5. production read-only smoke passes;
6. production deploy and authenticated two-tenant smoke pass;
7. deployed and rollback SHAs are recorded.
