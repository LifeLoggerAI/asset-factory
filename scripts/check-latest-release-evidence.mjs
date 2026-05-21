#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const evidenceDir = path.join(root, 'docs/release-evidence');

function fail(message) {
  console.error(`FAIL latest release evidence: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(evidenceDir)) {
  fail('docs/release-evidence does not exist');
}

const candidates = fs.readdirSync(evidenceDir)
  .filter((file) => file.endsWith('.md'))
  .filter((file) => !file.startsWith('README'))
  .map((file) => {
    const fullPath = path.join(evidenceDir, file);
    const stat = fs.statSync(fullPath);
    return { file, fullPath, mtimeMs: stat.mtimeMs };
  })
  .sort((a, b) => b.mtimeMs - a.mtimeMs || b.file.localeCompare(a.file));

if (candidates.length === 0) {
  fail('no markdown evidence files found under docs/release-evidence');
}

const latest = candidates[0];
const relative = path.relative(root, latest.fullPath);
console.log(`Checking latest release evidence: ${relative}`);

const result = spawnSync(process.execPath, ['scripts/check-release-evidence.mjs', relative], {
  cwd: root,
  stdio: 'inherit'
});

if (result.error) {
  fail(result.error.message);
}

process.exit(result.status ?? 1);
