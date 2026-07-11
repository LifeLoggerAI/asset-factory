import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const source = fs.readFileSync(path.join(root, 'scripts', 'audit-root-if-locked.mjs'), 'utf8');

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

console.log('PASS cross-platform root audit invocation control');
