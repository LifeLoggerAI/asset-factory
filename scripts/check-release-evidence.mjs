#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const evidenceArg = process.argv[2] || process.env.ASSET_FACTORY_RELEASE_EVIDENCE;

function fail(message) {
  console.error(`FAIL release evidence: ${message}`);
  process.exit(1);
}

function read(filePath) {
  if (!fs.existsSync(filePath)) fail(`missing evidence file ${filePath}`);
  return fs.readFileSync(filePath, 'utf8');
}

function fieldValue(label) {
  return evidence.match(new RegExp(`^\\s*${label}:\\s*(.+?)\\s*$`, 'm'))?.[1]?.trim() || '';
}

function requireConcreteField(label, options = {}) {
  const value = fieldValue(label);
  if (!value) fail(`missing field ${label}`);
  if (value.startsWith('<') || /\bTODO\b/i.test(value) || /\bTBD\b/i.test(value)) {
    fail(`field ${label} is not filled with concrete evidence`);
  }
  if (options.sha && !/^[a-f0-9]{7,40}$/i.test(value)) {
    fail(`${label} must be a Git SHA or short SHA, got ${JSON.stringify(value)}`);
  }
  if (options.evidenceLink) {
    const looksLikeEvidence = /^https?:\/\//.test(value) || value.startsWith('docs/release-evidence/') || value.startsWith('release-evidence/');
    if (!looksLikeEvidence) {
      fail(`${label} must be a URL or repo evidence path, got ${JSON.stringify(value)}`);
    }
  }
  return value;
}

function requireSection(title) {
  if (!evidence.includes(`## ${title}`) && !evidence.includes(`### ${title}`)) {
    fail(`missing section ${title}`);
  }
}

function requireConcreteMarkdownLabel(label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const lineMatch = evidence.match(new RegExp(`^\\s*-\\s*${escaped}:\\s*(.+?)\\s*$`, 'm')) ||
    evidence.match(new RegExp(`^\\s*${escaped}:\\s*(.+?)\\s*$`, 'm'));
  if (!lineMatch) fail(`missing concrete evidence label ${label}`);
  const value = lineMatch[1].trim();
  if (!value || value.startsWith('<') || /\bTODO\b/i.test(value) || /\bTBD\b/i.test(value)) {
    fail(`evidence label ${label} is not filled with concrete evidence`);
  }
}

if (!evidenceArg) {
  fail('pass an evidence markdown file path, or set ASSET_FACTORY_RELEASE_EVIDENCE');
}

const evidencePath = path.resolve(root, evidenceArg);
const evidence = read(evidencePath);

if (/<[^>\n]+>/.test(evidence)) {
  fail('placeholder angle-bracket content remains in evidence file');
}

if (/\b(TODO|TBD)\b/i.test(evidence)) {
  fail('TODO/TBD placeholder remains in evidence file');
}

const requiredLiterals = [
  'repo: LifeLoggerAI/asset-factory',
  'api_contract_version: asset-factory-api-v1',
  'firebase_project: urai-4dc1d',
  'staging_url: https://staging.uraiassetfactory.com',
  'production_url: https://www.uraiassetfactory.com',
  'fallback_disabled: true',
  'auth_required: true',
  'api_key_required: true',
  'tenant_isolation_verified: true',
  'provider_generation_verified: true',
  'worker_queue_verified: true',
  'stripe_entitlements_verified: true',
  'diagnostics_redacted: true',
  'cron_secret_verified: true',
  'observability_verified: true',
  'legal_pages_verified: true'
];

for (const literal of requiredLiterals) {
  if (!evidence.includes(literal)) {
    fail(`missing required literal ${JSON.stringify(literal)}`);
  }
}

const requiredSections = [
  'Release identity',
  'Machine-readable release block',
  'Status summary',
  'Commands and outputs',
  'Endpoint proof',
  'Output inventory proof',
  'Observability proof',
  'Rollback',
  'Validation',
  'Decision'
];

for (const section of requiredSections) requireSection(section);

const requiredFields = [
  'branch',
  'commit',
  'local_proof_run',
  'staging_smoke_run',
  'production_smoke_run',
  'rollback_sha',
  'owner'
];

for (const field of requiredFields) requireConcreteField(field);

const shaFields = ['commit', 'rollback_sha'];
for (const field of shaFields) requireConcreteField(field, { sha: true });

const linkFields = ['local_proof_run', 'staging_smoke_run', 'production_smoke_run'];
for (const field of linkFields) requireConcreteField(field, { evidenceLink: true });

const humanIdentityFields = [
  'Environment',
  'Branch',
  'Commit SHA',
  'Release owner',
  'Reviewers',
  'Date/time UTC',
  'Workflow run URL',
  'Artifact URL'
];

for (const field of humanIdentityFields) requireConcreteMarkdownLabel(field);

const outputEvidenceLabels = [
  'Graphic',
  '3D model',
  'Audio',
  'Bundle',
  'assetFactoryRequests',
  'assetFactoryQueue',
  'assetManifests',
  'generated job records',
  'usage records',
  'entitlement records',
  'dead-letter records',
  'system status records',
  'Life Map records',
  'Private tenant path',
  'Public published path',
  'Signed/private download proof',
  'Cross-tenant denial proof'
];

for (const label of outputEvidenceLabels) requireConcreteMarkdownLabel(label);

const observabilityLabels = [
  'Request ID visible',
  'Structured logs visible',
  'Error tracking visible',
  'Queue depth visible',
  'DLQ visible',
  'Provider spend visible',
  'Uptime check visible',
  'Incident/support path verified'
];

for (const label of observabilityLabels) requireConcreteMarkdownLabel(label);

const rollbackLabels = [
  'Last known-good SHA',
  'Rollback command',
  'Feature flag kill switch',
  'Core rollback path'
];

for (const label of rollbackLabels) requireConcreteMarkdownLabel(label);

const releaseDecisionMatches = [
  '- [x] Do not release',
  '- [x] Release to staging only',
  '- [x] Release to production behind feature flag',
  '- [x] Release to production as locked dependency'
].filter((decision) => evidence.includes(decision));

if (releaseDecisionMatches.length !== 1) {
  fail(`exactly one release decision must be selected with [x], found ${releaseDecisionMatches.length}`);
}

if (evidence.includes('- [x] Release to production as locked dependency') && !evidence.includes('Status: **LOCKED**')) {
  fail('locked dependency decision requires an explicit locked status in the same evidence bundle');
}

const rationaleMatch = evidence.match(/Decision rationale:\s*```text\s*([\s\S]*?)\s*```/m);
if (!rationaleMatch || !rationaleMatch[1].trim()) {
  fail('decision rationale must be filled');
}

const forbidden = [
  '100% complete',
  'fully production ready',
  'fully wired',
  'fully verified',
  'system of systems complete',
  'all outputs delivered',
  'no roadmap remaining'
];

const lower = evidence.toLowerCase();
for (const phrase of forbidden) {
  if (lower.includes(phrase)) {
    fail(`forbidden premature completion phrase found: ${phrase}`);
  }
}

console.log(`PASS release evidence ${path.relative(root, evidencePath)}`);
