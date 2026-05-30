# URAI Asset Factory Production Hardening Checklist

Domain: uraiassetfactory.com

Before production approval:

- Confirm public access, request-access, login, privacy, and terms routes exist.
- Confirm public metadata exists.
- Confirm public pages link to URAI Privacy.
- Confirm dashboard, projects, assets, characters, scenes, voices, and exports routes are gated.
- Confirm protected routes are no-indexed.
- Confirm no prompt secrets, client assets, unreleased assets, or protected IP records render before auth.
- Confirm request-access form preserves UTM/source fields.
- Confirm request-access writes to approved backend.
- Confirm approval and export actions have audit logging or an audit plan.
- Run build, typecheck, tests, and QA.
- Record DNS, SSL, deploy URL, latest commit, and owner approval.
