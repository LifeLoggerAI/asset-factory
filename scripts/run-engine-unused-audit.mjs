#!/usr/bin/env node
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {verifyFactoryGlobTooling} from './verify-factory-glob-tooling.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
// Never let npx download an unpatched replacement for the actual installed auditor.
verifyFactoryGlobTooling(root);
const require = createRequire(path.join(root, 'engine/package.json'));
const main = require.resolve('depcheck');
const bin = path.resolve(path.dirname(main), '../bin/depcheck.js');
const result = spawnSync(process.execPath, [bin, ...process.argv.slice(2)], {cwd: path.join(root, 'engine'), stdio: 'inherit'});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
