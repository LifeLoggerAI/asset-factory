import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

const baseUrl = process.env.ASSET_FACTORY_BASE_URL || "https://uraiassetfactory.com";

function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: false,
    env: { ...process.env, ...env },
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

console.log(`Verifying Asset Factory custom domain: ${baseUrl}`);

run("npm", ["run", "smoke:website"], {
  ASSET_FACTORY_BASE_URL: baseUrl,
  ASSET_FACTORY_SMOKE_READONLY: "true",
});

run("npm", ["run", "smoke:prod"], {
  ASSET_FACTORY_BASE_URL: baseUrl,
});

const sha = spawnSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).stdout.trim();

const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

mkdirSync("docs/release-evidence", { recursive: true });

writeFileSync(
  "docs/release-evidence/2026-05-16-custom-domain-api-verified.md",
  `# Asset Factory Custom Domain API Verification Evidence

- Environment: production custom domain
- Repo: LifeLoggerAI/asset-factory
- Branch: main
- Commit SHA: ${sha}
- Date/time: ${now}
- Firebase project: urai-4dc1d
- Canonical API base: ${baseUrl}

## Commands

\`\`\`bash
ASSET_FACTORY_BASE_URL=${baseUrl} ASSET_FACTORY_SMOKE_READONLY=true npm run smoke:website
ASSET_FACTORY_BASE_URL=${baseUrl} npm run smoke:prod
\`\`\`

## Result

| Check | Result | Evidence |
| --- | --- | --- |
| Custom-domain health | pass | PASS /api/health |
| Read-only smoke | pass | PASS read-only production finalization smoke |
| Authenticated smoke | pass | PASS production finalization smoke |
| Custom-domain API routing | pass | /api/* no longer returns Next.js 404 |

## Decision

- [x] Custom-domain API routing accepted
- [x] Custom-domain read-only smoke accepted
- [x] Custom-domain authenticated smoke accepted
- [ ] Completion lock can be changed to LOCKED

## Notes

This evidence is generated only after both custom-domain smoke commands pass.
`
);

console.log("PASS custom-domain verification evidence written.");
console.log("Next:");
console.log("git add docs/release-evidence/2026-05-16-custom-domain-api-verified.md");
console.log('git commit -m "Add custom domain API verification evidence for Asset Factory"');
console.log("git push origin main");
