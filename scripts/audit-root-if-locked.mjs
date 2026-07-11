import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const lockPath = path.join(root, 'package-lock.json');

if (!fs.existsSync(lockPath)) {
  console.log('Root package-lock.json is not committed yet; root dependency audit is deferred to the exact-head Root Lockfile Candidate workflow.');
  process.exit(0);
}

const auditArgs = ['audit', '--audit-level=high', '--omit=dev'];
const npmExecPath = process.env.npm_execpath;
const hasTrustedNpmCli = Boolean(
  npmExecPath && path.isAbsolute(npmExecPath) && fs.existsSync(npmExecPath)
);
const command = hasTrustedNpmCli
  ? process.execPath
  : process.platform === 'win32' ? 'npm.cmd' : 'npm';
const args = hasTrustedNpmCli
  ? [npmExecPath, ...auditArgs]
  : auditArgs;
const result = spawnSync(command, args, {
  cwd: root,
  stdio: 'inherit',
  shell: !hasTrustedNpmCli && process.platform === 'win32',
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
