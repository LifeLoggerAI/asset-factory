#!/usr/bin/env node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function fail(message) {
  console.error(`Refusing Firebase deployment: ${message}`);
  process.exit(1);
}

const allowedScopes = new Set([
  'hosting',
  'functions',
  'hosting,firestore,storage',
  'hosting,functions,firestore,storage',
]);
const scopes = process.argv[2];
const sourceConfig = process.argv[3] || 'firebase.json';
const projectId = (process.env.ASSET_FACTORY_PROJECT_ID || '').trim();
const hostingSite = (process.env.ASSET_FACTORY_HOSTING_SITE || '').trim();
const baseUrl = (process.env.ASSET_FACTORY_BASE_URL || '').trim();
const customDomainAllowlist = (process.env.ASSET_FACTORY_CUSTOM_DOMAIN_ALLOWLIST || '')
  .split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);

if (process.env.ASSET_FACTORY_DIRECT_DEPLOY_CONFIRM !== 'DEPLOY_DEDICATED_ASSET_FACTORY') {
  fail('ASSET_FACTORY_DIRECT_DEPLOY_CONFIRM must equal DEPLOY_DEDICATED_ASSET_FACTORY');
}
if (!allowedScopes.has(scopes)) fail('requested deploy scope is not allowlisted');
if (!projectId || !hostingSite || !baseUrl) fail('dedicated project, Hosting site, and base URL are required');
if (projectId === 'urai-4dc1d' || hostingSite === 'urai-4dc1d') fail('canonical consumer project/site is forbidden');
if (/urai-4dc1d\.web\.app/i.test(baseUrl) || /^https:\/\/(?:www\.)?urai\.app(?:\/|$)/i.test(baseUrl)) {
  fail('canonical consumer URL is forbidden');
}
let parsedUrl;
try {
  parsedUrl = new URL(baseUrl);
} catch {
  fail('ASSET_FACTORY_BASE_URL must be an absolute URL');
}
if (parsedUrl.protocol !== 'https:') fail('ASSET_FACTORY_BASE_URL must use HTTPS');
if (parsedUrl.username || parsedUrl.password || parsedUrl.port || parsedUrl.pathname !== '/' || parsedUrl.search || parsedUrl.hash) {
  fail('ASSET_FACTORY_BASE_URL must be an origin-only HTTPS URL');
}
const allowedHosts = new Set([
  `${hostingSite}.web.app`.toLowerCase(),
  `${hostingSite}.firebaseapp.com`.toLowerCase(),
  ...customDomainAllowlist,
]);
if (!allowedHosts.has(parsedUrl.hostname.toLowerCase())) {
  fail('ASSET_FACTORY_BASE_URL hostname must match the configured Hosting site or explicit custom-domain allowlist');
}

const source = JSON.parse(readFileSync(sourceConfig, 'utf8'));
if (!source.hosting || Array.isArray(source.hosting)) fail('Firebase config must contain one Hosting object');

const runtimeDirectory = mkdtempSync(path.join(tmpdir(), 'asset-factory-firebase-'));
const runtimeConfig = path.join(runtimeDirectory, 'firebase.json');
try {
  source.hosting = { ...source.hosting, site: hostingSite };
  writeFileSync(runtimeConfig, `${JSON.stringify(source, null, 2)}\n`, { mode: 0o600 });
  const result = spawnSync(
    'firebase',
    ['deploy', '--config', runtimeConfig, '--project', projectId, '--only', scopes],
    { cwd: process.cwd(), env: process.env, stdio: 'inherit', shell: false },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status || 1;
} finally {
  rmSync(runtimeDirectory, { recursive: true, force: true });
}
