#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const promptPath = path.join(root, 'docs/ASSET_FACTORY_IMPLEMENTATION_AUDIT_PROMPT.md');
const launchPath = path.join(root, 'LAUNCH_READINESS.md');
const readmePath = path.join(root, 'README.md');

const requiredFiles = [promptPath, launchPath, readmePath];
const missingFiles = requiredFiles.filter((filePath) => !fs.existsSync(filePath));

if (missingFiles.length > 0) {
  console.error('FAIL implementation audit prompt: missing required files');
  for (const filePath of missingFiles) {
    console.error(`- ${path.relative(root, filePath)}`);
  }
  process.exit(1);
}

const prompt = fs.readFileSync(promptPath, 'utf8');
const launch = fs.readFileSync(launchPath, 'utf8');
const readme = fs.readFileSync(readmePath, 'utf8');

const requiredPromptPhrases = [
  'automation-first',
  'Do not claim the system is production-ready',
  'Treat LAUNCH_READINESS.md as the current launch source of truth',
  'Never weaken auth, tenant isolation, diagnostics redaction, release evidence, smoke tests, or completion-lock gates',
  'Never update completion-lock status to locked unless every P0 gate is proven with linked evidence',
  'ASSET_FACTORY_FORCE_LOCAL=false',
  'provider-backed generation',
  'Durable queue/worker',
  'Stripe webhook',
  'Observability',
  'URAI Spatial visual standard',
  'system-of-systems',
  'human approval'
];

const missingPromptPhrases = requiredPromptPhrases.filter((phrase) => !prompt.includes(phrase));
if (missingPromptPhrases.length > 0) {
  console.error('FAIL implementation audit prompt: required prompt language missing');
  for (const phrase of missingPromptPhrases) console.error(`- ${phrase}`);
  process.exit(1);
}

const requiredLaunchPhrases = [
  'Status: **repo-side hardening complete for current pass; live evidence required before production lock**.',
  'Do not call Asset Factory production-ready until every P0 gate below is complete and linked to evidence.',
  'Live staging workflow evidence with `ASSET_FACTORY_FORCE_LOCAL=false`.',
  'Real provider-backed generation using production credentials and selected model IDs.',
  'Deployed durable worker proof with leases, retries, retry limits, idempotency, dead-letter handling, and cleanup/retention.',
  'Production Stripe webhook proof that verified events persist idempotent tenant quota/plan records.',
  'Production observability, including request IDs, structured logs, error tracking, metrics, uptime checks, and cost/queue dashboards.'
];

const missingLaunchPhrases = requiredLaunchPhrases.filter((phrase) => !launch.includes(phrase));
if (missingLaunchPhrases.length > 0) {
  console.error('FAIL implementation audit prompt: launch-readiness source language changed; update prompt guard intentionally');
  for (const phrase of missingLaunchPhrases) console.error(`- ${phrase}`);
  process.exit(1);
}

const forbiddenPromptPhrases = [
  'Status: **LOCKED**',
  'Status: LOCKED',
  'fully production ready',
  'system of systems complete',
  '100% complete',
  'all outputs delivered'
];

const forbiddenMatches = forbiddenPromptPhrases.filter((phrase) => prompt.includes(phrase));
if (forbiddenMatches.length > 0) {
  console.error('FAIL implementation audit prompt: premature completion claims found');
  for (const phrase of forbiddenMatches) console.error(`- ${phrase}`);
  process.exit(1);
}

if (!readme.includes('docs/ASSET_FACTORY_IMPLEMENTATION_AUDIT_PROMPT.md')) {
  console.error('FAIL implementation audit prompt: README does not reference docs/ASSET_FACTORY_IMPLEMENTATION_AUDIT_PROMPT.md');
  process.exit(1);
}

console.log('PASS implementation audit prompt is present, launch-aligned, automation-first, and README-linked');
