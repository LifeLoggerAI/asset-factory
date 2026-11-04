#!/usr/bin/env node

const commands = new Set([
  'audit:root',
  'audit:all',
  'lockfile:refresh-root',
  'engine:harden',
  'engine:lock',
]);
const command = process.argv[2];
const label = commands.has(command) ? command : 'Legacy NPM dependency command';

process.stderr.write(`${label} is retired for the supported frozen workspace. No audit or lock mutation was performed.\n`);
process.stderr.write('Install the current graph with node scripts/install-locked-dependencies.mjs from the repository root.\n');
process.stderr.write('Verify actual installed source with node scripts/verify-factory-glob-tooling.mjs.\n');
process.stderr.write('Full graph and all-severity security acceptance requires the exact-head Factory Tooling Installed Compatibility and Factory Firebase SDK lock refresh proof workflows.\n');
process.stderr.write('The historical engine/npm-shrinkwrap.json is retained as superseded bootstrap history.\n');
process.exitCode = 1;
