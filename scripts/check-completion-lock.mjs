#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const requiredFiles = [
  'LAUNCH_READINESS.md',
  'docs/contracts/ASSET_FACTORY_API.md',
  'docs/contracts/ASSET_FACTORY_COMPLETION_LOCK.md',
  'docs/openapi/asset-factory.openapi.json',
  'docs/templates/ASSET_FACTORY_RELEASE_EVIDENCE.md',
  'docs/OPERATIONS_RUNBOOK.md',
  'docs/PRIVACY_SAFETY_VERIFICATION.md',
  'docs/COMPLETION_CHECKLIST.md'
];

const missing = requiredFiles.filter((file) => !fs.existsSync(path.join(root, file)));
if (missing.length > 0) {
  console.error('FAIL completion lock: missing required files');
  for (const file of missing) console.error(`- ${file}`);
  process.exit(1);
}

const lockPath = path.join(root, 'docs/contracts/ASSET_FACTORY_COMPLETION_LOCK.md');
const launchPath = path.join(root, 'LAUNCH_READINESS.md');
const contractPath = path.join(root, 'docs/contracts/ASSET_FACTORY_API.md');
const openapiPath = path.join(root, 'docs/openapi/asset-factory.openapi.json');
const privacyPath = path.join(root, 'docs/PRIVACY_SAFETY_VERIFICATION.md');
const checklistPath = path.join(root, 'docs/COMPLETION_CHECKLIST.md');
const operationsPath = path.join(root, 'docs/OPERATIONS_RUNBOOK.md');

const lock = fs.readFileSync(lockPath, 'utf8');
const launch = fs.readFileSync(launchPath, 'utf8');
const contract = fs.readFileSync(contractPath, 'utf8');
const openapiRaw = fs.readFileSync(openapiPath, 'utf8');
const privacy = fs.readFileSync(privacyPath, 'utf8');
const checklist = fs.readFileSync(checklistPath, 'utf8');
const operations = fs.readFileSync(operationsPath, 'utf8');

let openapi;
try {
  openapi = JSON.parse(openapiRaw);
} catch (error) {
  console.error('FAIL completion lock: OpenAPI JSON is invalid');
  console.error(error.message);
  process.exit(1);
}

const requiredPhrases = [
  ['lock status', lock, 'Status: **NOT LOCKED**'],
  ['repo-side status in lock', lock, 'Repo-side hardening'],
  ['live evidence state in lock', lock, 'LIVE_EVIDENCE_REQUIRED'],
  ['canonical tracker in lock', lock, 'GitHub issue #63'],
  ['canonical API version in lock', lock, 'asset-factory-api-v1'],
  ['canonical API version in contract', contract, 'asset-factory-api-v1'],
  ['launch readiness current status', launch, 'Status: **repo-side hardening complete for current pass; live evidence required before production lock**.'],
  ['launch readiness canonical tracker', launch, 'Canonical live tracker: GitHub issue #63.'],
  ['operations workflow path', operations, 'Actions -> Deploy Asset Factory -> Run workflow'],
  ['checklist live evidence state', checklist, 'Status: NOT COMPLETE / NOT LOCKED / LIVE EVIDENCE REQUIRED'],
  ['privacy safety blocked state', privacy, 'Status: BLOCKED UNTIL FINAL REVIEW AND LIVE TEST EVIDENCE'],
  ['tenant isolation gate', lock, 'Tenant isolation gate'],
  ['provider generation gate', lock, 'Provider generation'],
  ['worker gate', lock, 'Durable queue/worker'],
  ['billing gate', lock, 'Stripe webhook'],
  ['observability gate', lock, 'Observability'],
  ['core dependency gate', lock, 'UrAi Core'],
  ['release evidence validator command', lock, 'node scripts/check-release-evidence.mjs']
];

const phraseFailures = requiredPhrases.filter(([name, text, phrase]) => !text.includes(phrase));
if (phraseFailures.length > 0) {
  console.error('FAIL completion lock: required lock language missing');
  for (const [name, , phrase] of phraseFailures) console.error(`- ${name}: ${phrase}`);
  process.exit(1);
}

const stalePhrases = [
  'Status: **not production-ready yet**',
  'Asset Factory is **not production-ready until `LAUNCH_READINESS.md` gates pass in staging and production**.',
  'nvm install 20.19.0',
  'nvm use 20.19.0'
];

const currentDocs = [
  ['launch readiness', launch],
  ['operations runbook', operations],
  ['completion checklist', checklist],
  ['privacy safety', privacy]
];

for (const [name, text] of currentDocs) {
  for (const phrase of stalePhrases) {
    if (text.includes(phrase)) {
      console.error('FAIL completion lock: stale launch/runtime wording found');
      console.error(`- ${name}: ${phrase}`);
      process.exit(1);
    }
  }
}

const requiredPaths = ['/api/health', '/api/assets', '/api/assets/{assetId}', '/api/lifemap/events'];
const missingPaths = requiredPaths.filter((route) => !openapi.paths || !openapi.paths[route]);
if (missingPaths.length > 0) {
  console.error('FAIL completion lock: OpenAPI missing required paths');
  for (const route of missingPaths) console.error(`- ${route}`);
  process.exit(1);
}

if (openapi.info?.version !== 'asset-factory-api-v1') {
  console.error(`FAIL completion lock: OpenAPI version is ${openapi.info?.version || 'missing'}, expected asset-factory-api-v1`);
  process.exit(1);
}

const forbiddenPrematureClaims = [
  'Status: **LOCKED**',
  'Status: LOCKED',
  '100% complete',
  'fully production ready',
  'system of systems complete',
  'all outputs delivered'
];

const filesToScan = [
  ['completion lock', lock],
  ['launch readiness', launch],
  ['api contract', contract],
  ['privacy safety', privacy],
  ['completion checklist', checklist]
];

const premature = [];
for (const [name, text] of filesToScan) {
  const allowedForbiddenSection = text.includes('Forbidden completion claims') || text.includes('Banned completion claims');
  for (const phrase of forbiddenPrematureClaims) {
    if (text.includes(phrase) && !allowedForbiddenSection) {
      premature.push(`${name}: ${phrase}`);
    }
  }
}

if (premature.length > 0) {
  console.error('FAIL completion lock: premature completion claims found');
  for (const item of premature) console.error(`- ${item}`);
  process.exit(1);
}

console.log('PASS completion lock contract files present and internally consistent');