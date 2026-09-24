#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const legacyProjects = new Set(['urai-4dc1d', 'asset-factory-dev-id']);
const legacyHosts = new Set([
  'urai-4dc1d.web.app',
  'urai-4dc1d.firebaseapp.com',
  'asset-factory-dev-id.web.app',
  'asset-factory-dev-id.firebaseapp.com',
  'urai.app',
  'www.urai.app',
]);

function fail(message) {
  console.error(`ASSET_FACTORY_PRODUCTION_TARGET=BLOCKED: ${message}`);
  process.exit(1);
}

const projectId = String(process.env.ASSET_FACTORY_FIREBASE_PROJECT_ID || '').trim();
const baseUrlRaw = String(process.env.ASSET_FACTORY_BASE_URL || '').trim();

if (!projectId) fail('ASSET_FACTORY_FIREBASE_PROJECT_ID is required.');
if (legacyProjects.has(projectId)) fail(`legacy/shared Firebase project ${projectId} is not valid final Asset Factory production authority.`);
if (!/^[a-z][a-z0-9-]{4,29}$/.test(projectId)) fail('Firebase project id has an invalid format.');

if (!baseUrlRaw) fail('ASSET_FACTORY_BASE_URL is required.');
let baseUrl;
try {
  baseUrl = new URL(baseUrlRaw);
} catch {
  fail('ASSET_FACTORY_BASE_URL must be a valid absolute URL.');
}
if (baseUrl.protocol !== 'https:') fail('ASSET_FACTORY_BASE_URL must use HTTPS.');
if (legacyHosts.has(baseUrl.hostname.toLowerCase())) fail(`legacy/shared host ${baseUrl.hostname} is not valid final Asset Factory production authority.`);

const args = process.argv.slice(2);
const checkOnly = args.includes('--check-only');
const cwdIndex = args.indexOf('--cwd');
const onlyIndex = args.indexOf('--only');
const cwd = cwdIndex >= 0 ? args[cwdIndex + 1] : '.';
const only = onlyIndex >= 0 ? args[onlyIndex + 1] : '';

if (cwdIndex >= 0 && !args[cwdIndex + 1]) fail('--cwd requires a relative directory.');
if (onlyIndex >= 0 && !only) fail('--only requires Firebase deploy targets.');

const allowedTargets = new Set(['hosting','functions','firestore','storage']);
if (only) {
  for (const target of only.split(',').map((value) => value.trim()).filter(Boolean)) {
    if (!allowedTargets.has(target)) fail(`unsupported Firebase deploy target: ${target}`);
  }
}

console.log('ASSET_FACTORY_PRODUCTION_TARGET=VALIDATED');
console.log(`PROJECT_ID=${projectId}`);
console.log(`BASE_HOST=${baseUrl.hostname}`);

if (checkOnly) process.exit(0);
if (!only) fail('deployment requires --only with an explicit bounded target list.');

const firebaseBin = process.platform === 'win32' ? 'firebase.cmd' : 'firebase';
const result = spawnSync(firebaseBin, ['deploy', '--project', projectId, '--only', only], {
  cwd: path.resolve(process.cwd(), cwd),
  env: process.env,
  stdio: 'inherit',
  shell: false,
});
if (result.error) fail(`failed to launch Firebase CLI: ${result.error.message}`);
process.exit(result.status ?? 1);
