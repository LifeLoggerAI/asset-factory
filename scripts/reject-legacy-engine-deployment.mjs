#!/usr/bin/env node

const roles = new Set(['api', 'worker_v2']);
const role = roles.has(process.argv[2]) ? process.argv[2] : 'engine';
process.stderr.write(`Legacy ${role} deployment is retired. The preserved engine prototypes are outside the adopted deployment surface.\n`);
process.stderr.write('Use the existing Factory release controller and its staging/production acceptance gates.\n');
process.stderr.write('The supported engine npm start path is local proof only and is not selected here.\n');
process.stderr.write('See docs/contracts/ASSET_FACTORY_COMPLETION_LOCK.md and docs/security/cloud-storage-integrity-20261007.md.\n');
process.exitCode = 1;
