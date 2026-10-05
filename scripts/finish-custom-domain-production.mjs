import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

const baseUrl = String(process.env.ASSET_FACTORY_BASE_URL || "").trim();
const firebaseProject = String(process.env.ASSET_FACTORY_FIREBASE_PROJECT_ID || "").trim();
const firebaseHostingSite = String(process.env.ASSET_FACTORY_FIREBASE_HOSTING_SITE || "").trim();

const legacyProjects = new Set(["urai-4dc1d", "asset-factory-dev-id", "geturai-landing-hub"]);
const legacyHostingSites = new Set([...legacyProjects, "asset-factory-prod", "asset-factory-admin"]);
const legacyHosts = new Set([
  "urai-4dc1d.web.app",
  "urai-4dc1d.firebaseapp.com",
  "asset-factory-dev-id.web.app",
  "asset-factory-dev-id.firebaseapp.com",
  "geturai-landing-hub.web.app",
  "geturai-landing-hub.firebaseapp.com",
  "urai.app",
  "www.urai.app",
]);

if (!baseUrl || !firebaseProject || !firebaseHostingSite) {
  console.error("ASSET_FACTORY_BASE_URL, ASSET_FACTORY_FIREBASE_PROJECT_ID, and ASSET_FACTORY_FIREBASE_HOSTING_SITE are required before custom-domain verification.");
  process.exit(1);
}

let parsedBase;
try {
  parsedBase = new URL(baseUrl);
} catch {
  console.error("ASSET_FACTORY_BASE_URL must be a valid absolute URL.");
  process.exit(1);
}
const normalizedHost = parsedBase.hostname.toLowerCase().replace(/\.$/, "");
if (parsedBase.protocol !== "https:" || legacyHosts.has(normalizedHost) || legacyProjects.has(firebaseProject) || legacyHostingSites.has(firebaseHostingSite)) {
  console.error("Refusing legacy/shared Asset Factory authority for custom-domain verification.");
  process.exit(1);
}

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

run("npm", ["run", "validate:production-target"], {
  ASSET_FACTORY_BASE_URL: baseUrl,
  ASSET_FACTORY_FIREBASE_PROJECT_ID: firebaseProject,
  ASSET_FACTORY_FIREBASE_HOSTING_SITE: firebaseHostingSite,
});

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
- Firebase project: ${firebaseProject}
- Firebase Hosting site: ${firebaseHostingSite}
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
