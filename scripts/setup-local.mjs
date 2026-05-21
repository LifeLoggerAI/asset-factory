#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const requiredMajor = 22;
const actual = process.versions.node;
const actualMajor = Number(actual.split('.')[0]);

function fail(message) {
  console.error(`FAIL local setup: ${message}`);
  process.exit(1);
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

run('Install root dependencies', 'npm', ['install']);
run('Install engine dependencies', 'npm', ['--prefix', 'engine', 'install']);
run('Install functions dependencies', 'npm', ['--prefix', 'functions', 'install']);
run('Install LifeMap functions dependencies', 'npm', ['--prefix', 'life-map-pipeline/functions', 'install']);
run('Install Studio dependencies', 'npm', ['--prefix', 'assetfactory-studio', 'install']);
run('Run repo doctor', 'npm', ['run', 'doctor']);

console.log('\nPASS local setup completed\n');
