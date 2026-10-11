#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// Resolve from this script so Studio working-directory jobs use the same workspace.
const root = fileURLToPath(new URL('../', import.meta.url));
const deployment = process.argv.includes('--deployment-functions');
const command = deployment ? 'npm' : 'corepack';
const args = deployment
  ? ['--prefix', 'life-map-pipeline/functions', 'ci', '--ignore-scripts', '--no-audit', '--no-fund']
  : ['pnpm@9.15.9', 'install', '--frozen-lockfile', '--ignore-scripts'];
const result = spawnSync(command, args, {cwd: root, stdio: 'inherit'});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
