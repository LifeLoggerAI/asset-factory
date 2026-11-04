# Factory Studio Next.js security patch — 2026-10-07

Factory source owner #421 at `46ed83135c26942d3130d0c57baab9ad3dadd714` pins Next.js and eslint-config-next 16.3.6. The official GitHub reviewed advisory database at `bd4903bcb0086eb4b511a155cd54179818bbefe3` records two cache-poisoning advisories published October 7, 2026:

- [GHSA-mcj8-r9mp-w47p](https://github.com/vercel/next.js/security/advisories/GHSA-mcj8-r9mp-w47p): affected Next.js 16.0.0 through versions before 16.3.8, and 15.0.0 before 15.5.27; exact database blob `a097d89af09b37ff7742d3908d0928227c10e8cf`.
- [GHSA-4jqv-mc3x-m676](https://github.com/vercel/next.js/security/advisories/GHSA-4jqv-mc3x-m676): same version bounds; exact database blob `ab7e2d53424010a3fc762a82fbd61d309fb8c24f`.

This donor pins Next.js and eslint-config-next 16.3.8, and updates all matching env, ESLint plugin and eight optional SWC packages in the existing pnpm lockfile. The 12 replacement SHA-512 integrities, dependency declarations, peer requirements, engines, OS and CPU metadata were read from the official individual public npm version endpoints. Existing compatible locked helper, PostCSS, browser-map, styled-jsx, React and sharp versions remain unchanged.

Observed source checks: the manifest equals its lockfile importer; all 12 official integrities and metadata agree; all dependency ranges are satisfied; package and snapshot counts remain 1,036 each; all four non-Studio importers, unrelated package entries, snapshots, overrides and patched dependencies remain structurally identical. These are offline source/lock consistency checks. They do not authorize a provider call or count as a frozen install, build, native CI, runtime mitigation test or deployment.

The existing braces security fork and fail-closed installed dependency guard are preserved. Its observed installed graph at `46ed83135c26942d3130d0c57baab9ad3dadd714` has 1,244 nodes and zero graph problems, but rejects unwaived HIGH `GHSA-vfj7-8cjw-p6xm`; job `113062231303`, run `37700408936`. This Next.js source patch provides no signed security acceptance or waiver for that finding and makes no claim of complete dependency acceptance.

No production provider request, generation, spending, deployment, asset admission, release approval or Golden Master authority is performed. Existing source owner #421 remains the deliberate convergence authority. Fresh combined-head frozen installs and native checks must establish candidate runtime compatibility; final production readback and independent security acceptance remain separate.
