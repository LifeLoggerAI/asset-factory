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

if (!evidenceArg) {
  fail('pass an evidence markdown file path, or set ASSET_FACTORY_RELEASE_EVIDENCE');
}

const evidencePath = path.resolve(root, evidenceArg);
const evidence = read(evidencePath);

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

const requiredFields = [
  'commit',
  'local_proof_run',
  'staging_smoke_run',
  'production_smoke_run',
  'rollback_sha',
  'owner'
];

for (const field of requiredFields) {
  const match = evidence.match(new RegExp(`^\\s*${field}:\\s*(.+?)\\s*$`, 'm'));
  if (!match) fail(`missing field ${field}`);
  const value = match[1].trim();
  if (!value || value.startsWith('<') || value.includes('TODO') || value.includes('todo')) {
    fail(`field ${field} is not filled with concrete evidence`);
  }
}

const shaFields = ['commit', 'rollback_sha'];
for (const field of shaFields) {
  const value = evidence.match(new RegExp(`^\\s*${field}:\\s*(.+?)\\s*$`, 'm'))?.[1]?.trim() || '';
  if (!/^[a-f0-9]{7,40}$/i.test(value)) {
    fail(`${field} must be a Git SHA or short SHA, got ${JSON.stringify(value)}`);
  }
}

const linkFields = ['local_proof_run', 'staging_smoke_run', 'production_smoke_run'];
for (const field of linkFields) {
  const value = evidence.match(new RegExp(`^\\s*${field}:\\s*(.+?)\\s*$`, 'm'))?.[1]?.trim() || '';
  const looksLikeEvidence = /^https?:\/\//.test(value) || value.startsWith('docs/release-evidence/') || value.startsWith('release-evidence/');
  if (!looksLikeEvidence) {
    fail(`${field} must be a URL or repo evidence path, got ${JSON.stringify(value)}`);
  }
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
