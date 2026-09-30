# Historical Cloud Functions tree — no deployment authority

Status: **LEGACY / NON-DEPLOYABLE / RETAINED FOR FORENSIC HISTORY**

The active Asset Factory Firebase Functions source is:

`life-map-pipeline/functions`

and `firebase.json` pins that source to the Node 22 runtime.

This `functions/` directory remains in the repository only because older Asset Factory releases and audit records refer to it. Its Node 18 package metadata is **not** current production authority.

Rules:

- do not deploy this directory;
- do not restore it as `firebase.json.functions.source` without a fresh architecture/security review;
- do not use its dependency versions to describe current production runtime;
- new production work belongs in `life-map-pipeline/functions` or an explicitly approved successor;
- historical files may be read for forensic comparison only.

The root build/test path enforces this boundary with `scripts/check-legacy-functions-boundary.mjs`.
