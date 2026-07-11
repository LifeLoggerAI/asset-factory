import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const source = fs.readFileSync(path.join(root, 'scripts', 'audit-root-if-locked.mjs'), 'utf8');
const rootLockWorkflow = fs.readFileSync(
  path.join(root, '.github', 'workflows', 'root-lockfile-candidate.yml'),
  'utf8',
);

for (const [needle, label] of [
  ['process.env.npm_execpath', 'npm CLI path from npm run'],
  ['path.isAbsolute(npmExecPath)', 'absolute npm CLI validation'],
  ['fs.existsSync(npmExecPath)', 'existing npm CLI validation'],
  ['? process.execPath', 'Node execution of npm CLI'],
  ["process.platform === 'win32' ? 'npm.cmd' : 'npm'", 'cross-platform fallback'],
  ["shell: !hasTrustedNpmCli && process.platform === 'win32'", 'Windows command-shell fallback'],
  ["['audit', '--audit-level=high', '--omit=dev']", 'high-severity production audit arguments'],
]) {
  if (!source.includes(needle)) throw new Error(`Missing ${label}: ${needle}`);
}

if (source.includes("spawnSync(\n  npmExecutable")) {
  throw new Error('Forbidden direct npm.cmd spawn without a Windows shell fallback');
}

for (const [needle, label] of [
  ['npm audit --json --audit-level=high --omit=dev', 'machine-readable high-severity audit command'],
  ['root-lock-audit.json', 'raw audit report artifact'],
  ['root-lock-audit-receipt.json', 'audit receipt artifact'],
  ["schemaVersion: 'urai-root-lock-audit-1'", 'audit receipt schema'],
  ["schemaVersion: 'urai-root-lock-contract-3'", 'root-lock manifest schema'],
  ['packageLockSha256', 'lockfile hash binding'],
  ['auditReportSha256', 'audit report hash binding'],
  ['auditPassed: failures.length === 0', 'fail-closed audit result'],
  ['nodeVersion', 'Node runtime identity'],
  ['npmVersion', 'npm runtime identity'],
  ['registry', 'registry identity'],
  ["registry !== 'https://registry.npmjs.org/'", 'canonical public registry enforcement'],
  ['auditReceipt.auditPassed !== true', 'manifest requires passing audit receipt'],
  ['auditReceipt.packageLockSha256 !== packageLockSha256', 'manifest rechecks lock hash'],
  ['auditReceipt.auditReportSha256 !== auditReportSha256', 'manifest rechecks audit hash'],
  ['- scripts/test-audit-root-control.mjs', 'workflow path trigger for this guard'],
]) {
  if (!rootLockWorkflow.includes(needle)) {
    throw new Error(`Missing root-lock evidence control ${label}: ${needle}`);
  }
}

if (rootLockWorkflow.includes('npm audit --audit-level=high --omit=dev')) {
  throw new Error('Forbidden unrecorded root audit command without --json evidence');
}

const uploadBlock = rootLockWorkflow.slice(
  rootLockWorkflow.indexOf('- name: Upload root lock evidence'),
);
for (const artifact of ['root-lock-audit.json', 'root-lock-audit-receipt.json']) {
  if (!uploadBlock.includes(artifact)) {
    throw new Error(`Root-lock upload is missing ${artifact}`);
  }
}

console.log('PASS cross-platform root audit invocation and hash-bound evidence control');
