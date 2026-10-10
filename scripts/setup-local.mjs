#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const requiredMajor = 22;
const actual = process.versions.node;
const actualMajor = Number(actual.split('.')[0]);
const root = process.cwd();

function fail(message) {
  console.error(`FAIL local setup: ${message}`);
  process.exit(1);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(`Unable to read ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function run(label, command, args = []) {
  console.log(`\n> ${label}`);
  console.log(`$ ${[command, ...args].join(' ')}`);
  const result = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error) fail(`${label} failed: ${result.error.message}`);
  if (result.status !== 0) fail(`${label} exited with status ${result.status}`);
}

if (actualMajor !== requiredMajor) {
  fail(`Node ${requiredMajor}.x is required for full local setup and Studio dependency parity. Current Node is ${actual}. Run: nvm install 22 && nvm use 22`);
}

if (process.env.NPM_CONFIG_PREFIX) {
  fail(`NPM_CONFIG_PREFIX must be unset before setup. Current value: ${process.env.NPM_CONFIG_PREFIX}. Run: unset NPM_CONFIG_PREFIX`);
}

// One frozen workspace install applies the reviewed consumer patches everywhere.
run('Install frozen workspace dependencies', process.execPath, ['scripts/install-locked-dependencies.mjs']);
run('Verify installed safe tooling graph', process.execPath, ['scripts/verify-factory-glob-tooling.mjs']);
run('Run repo doctor', 'npm', ['run', 'doctor']);

console.log('\nPASS local setup completed\n');