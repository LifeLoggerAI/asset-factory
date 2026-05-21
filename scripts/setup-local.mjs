#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const requiredMajor = 22;
const actual = process.versions.node;
const actualMajor = Number(actual.split('.')[0]);
const root = process.cwd();
const installRootDependencies = process.env.ASSET_FACTORY_SETUP_INSTALL_ROOT_DEPS === 'true';

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

function packageNameToPath(packageName) {
  return packageName.startsWith('@') ? packageName.split('/').join(path.sep) : packageName;
}

function rootDependenciesInstalled() {
  const packageJson = readJson(path.join(root, 'package.json'));
  const dependencies = Object.keys(packageJson.dependencies || {});
  const missing = dependencies.filter((dependency) => {
    const packagePath = path.join(root, 'node_modules', packageNameToPath(dependency), 'package.json');
    return !fs.existsSync(packagePath);
  });
  return { ok: missing.length === 0, missing };
}

if (actualMajor !== requiredMajor) {
  fail(`Node ${requiredMajor}.x is required for full local setup and Studio dependency parity. Current Node is ${actual}. Run: nvm install 22 && nvm use 22`);
}

if (process.env.NPM_CONFIG_PREFIX) {
  fail(`NPM_CONFIG_PREFIX must be unset before setup. Current value: ${process.env.NPM_CONFIG_PREFIX}. Run: unset NPM_CONFIG_PREFIX`);
}

// Root package-lock.json is intentionally not committed in this repo. Avoid creating
// a transient root lockfile during default bootstrap; use `npm run lockfile:refresh-root`
// when intentionally refreshing and auditing the root lockfile.
const rootDeps = rootDependenciesInstalled();
if (rootDeps.ok) {
  console.log('\n> Root dependencies already installed; skipping root npm install');
} else if (installRootDependencies) {
  console.log(`\n> Missing root dependencies: ${rootDeps.missing.join(', ')}`);
  run('Install root dependencies without generating a root lockfile', 'npm', ['install', '--package-lock=false']);
} else {
  console.log(`\n> Missing root dependencies: ${rootDeps.missing.join(', ')}`);
  console.log('> Skipping root npm install by default because current repo gates do not require root dependencies.');
  console.log('> To install them intentionally, rerun with ASSET_FACTORY_SETUP_INSTALL_ROOT_DEPS=true.');
}

run('Install engine dependencies', 'npm', ['--prefix', 'engine', 'install']);
run('Install functions dependencies', 'npm', ['--prefix', 'functions', 'install']);
run('Install LifeMap functions dependencies', 'npm', ['--prefix', 'life-map-pipeline/functions', 'install']);
run('Install Studio dependencies', 'npm', ['--prefix', 'assetfactory-studio', 'install']);
run('Run repo doctor', 'npm', ['run', 'doctor']);

console.log('\nPASS local setup completed\n');