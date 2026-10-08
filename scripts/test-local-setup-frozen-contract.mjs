import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { validateFrozenLocalSetupSource } from './local-setup-frozen-contract.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const setup = fs.readFileSync(path.join(root, 'scripts/setup-local.mjs'), 'utf8');
const checker = fs.readFileSync(path.join(root, 'scripts/check-completion-lock.mjs'), 'utf8');
class Exit extends Error { constructor(code) { super('exit ' + code); this.code = code; } }

async function evaluate(source, { node = '22.23.3', env = {}, spawnStatus = 0, spawnError, failAt = -1, files = {}, checkerMode = false } = {}) {
  const calls = [];
  const output = [];
  const currentFs = { ...fs,
    readFileSync(name, encoding) { const relative = path.relative(root, name).replaceAll('\\', '/'); return Object.hasOwn(files, relative) ? files[relative] : fs.readFileSync(name, encoding); },
  };
  const context = vm.createContext({ process: { versions: { node }, env, platform: 'linux', execPath: '/owned/node22', cwd: () => root, exit: (code) => { throw new Exit(code); } },
    console: { log: (...values) => output.push(values.join(' ')), error: (...values) => output.push(values.join(' ')) } });
  const modules = {
    'node:fs': { default: currentFs },
    'node:path': { default: path },
    'node:child_process': { spawnSync(command, args, options) { const index = calls.length; calls.push({ command, args: [...args], options: { ...options } }); return { status: index === failAt ? spawnStatus : 0, error: index === failAt ? spawnError : undefined }; } },
    './local-setup-frozen-contract.mjs': { validateFrozenLocalSetupSource },
  };
  const subject = new vm.SourceTextModule(source, { context, identifier: checkerMode ? 'actual-completion-checker' : 'actual-local-setup' });
  await subject.link((name) => {
    assert.ok(modules[name], 'No unowned import: ' + name);
    const values = modules[name];
    return new vm.SyntheticModule(Object.keys(values), function () { for (const [key, value] of Object.entries(values)) this.setExport(key, value); }, { context });
  });
  let exit;
  try { await subject.evaluate(); } catch (error) { if (!(error instanceof Exit)) throw error; exit = error.code; }
  return { calls, output, exit };
}

test('actual default setup installs frozen workspace, verifies installed graph and runs doctor once in order', async () => {
  const result = await evaluate(setup);
  assert.equal(result.exit, undefined);
  assert.deepEqual(result.calls, [
    { command: '/owned/node22', args: ['scripts/install-locked-dependencies.mjs'], options: { stdio: 'inherit', shell: false } },
    { command: '/owned/node22', args: ['scripts/verify-factory-glob-tooling.mjs'], options: { stdio: 'inherit', shell: false } },
    { command: 'npm', args: ['run', 'doctor'], options: { stdio: 'inherit', shell: false } },
  ]);
  assert.deepEqual(validateFrozenLocalSetupSource(setup), { nodeMajor: 22, frozenWorkspaceInstall: true, installedToolingProof: true, doctor: true, commandCount: 3 });
});
for (const node of ['20.19.0', '24.20.0', 'unknown', '']) test('actual setup rejects incompatible Node before any command: ' + (node || 'empty'), async () => {
  const result = await evaluate(setup, { node });
  assert.equal(result.exit, 1);
  assert.equal(result.calls.length, 0);
});
test('actual setup rejects npm prefix before any command', async () => {
  const result = await evaluate(setup, { env: { NPM_CONFIG_PREFIX: '/synthetic-prefix' } });
  assert.equal(result.exit, 1); assert.equal(result.calls.length, 0);
});
for (const value of ['true', 'false']) test('retired root opt-in cannot bypass frozen install: ' + value, async () => {
  const result = await evaluate(setup, { env: { ASSET_FACTORY_SETUP_INSTALL_ROOT_DEPS: value } });
  assert.equal(result.exit, undefined); assert.equal(result.calls.length, 3);
  assert.equal(result.calls[0].args[0], 'scripts/install-locked-dependencies.mjs');
});
for (let index = 0; index < 3; index++) for (const mode of ['exit', 'spawn-error']) test('actual setup stops after ' + mode + ' at command ' + index, async () => {
  const result = await evaluate(setup, { failAt: index, spawnStatus: mode === 'exit' ? 7 : 0, spawnError: mode === 'spawn-error' ? new Error('synthetic spawn failure') : undefined });
  assert.equal(result.exit, 1); assert.equal(result.calls.length, index + 1);
});
const changes = [
  ['comment-only install', (source) => source.replace("run('Install frozen workspace dependencies', process.execPath, ['scripts/install-locked-dependencies.mjs']);", "// run('Install frozen workspace dependencies', process.execPath, ['scripts/install-locked-dependencies.mjs']);")],
  ['unfrozen install', (source) => source.replace("['scripts/install-locked-dependencies.mjs']", "['scripts/unfrozen-install.mjs']")],
  ['comment-only graph proof', (source) => source.replace("run('Verify installed safe tooling graph', process.execPath, ['scripts/verify-factory-glob-tooling.mjs']);", "// run('Verify installed safe tooling graph', process.execPath, ['scripts/verify-factory-glob-tooling.mjs']);")],
  ['comment-only doctor', (source) => source.replace("run('Run repo doctor', 'npm', ['run', 'doctor']);", "// run('Run repo doctor', 'npm', ['run', 'doctor']);")],
  ['different Node authority', (source) => source.replace('const requiredMajor = 22', 'const requiredMajor = 24')],
  ['skipped Node guard', (source) => source.replace('if (actualMajor !== requiredMajor)', 'if (false)')],
  ['skipped prefix guard', (source) => source.replace('if (process.env.NPM_CONFIG_PREFIX)', 'if (false)')],
  ['ignored child exit', (source) => source.replace('if (result.status !== 0)', 'if (false)')],
  ['ignored spawn error', (source) => source.replace('if (result.error)', 'if (false)')],
  ['hidden extra command', (source) => source + "\nif (true) run('unowned', 'npm', ['install']);\n"],
  ['silent child process', (source) => source.replace("stdio: 'inherit'", "stdio: 'ignore'")],
  ['success exit on failure', (source) => source.replace('process.exit(1)', 'process.exit(0)')],
  ['conditional failure exit', (source) => source.replace('process.exit(1);', 'if (false) process.exit(1);')],
  ['ignored real child result', (source) => source.replace('const result = spawnSync(command, args,', 'const ignored = spawnSync(command, args,') .replace('if (result.error)', 'const result = { status: 0 }; if (result.error)')],
  ['duplicate runner binding', (source) => source + '\\nfunction run(label, command, args) {}\\n'],
  ['unexpected runner statement', (source) => source.replace('if (result.error)', 'if (false) return; if (result.error)')],
  ['syntax error', (source) => source + '\nconst = ;\n'],
];
for (const [name, change] of changes) test('AST authority rejects ' + name + ' even retained comments/names cannot grant', async () => {
  const altered = change(setup); assert.notEqual(altered, setup);
  assert.throws(() => validateFrozenLocalSetupSource(altered));
  const result = await evaluate(checker, { files: { 'scripts/setup-local.mjs': altered }, checkerMode: true });
  assert.equal(result.exit, 1);
});
test('actual complete checker accepts current frozen setup without granting production lock', async () => {
  const result = await evaluate(checker, { checkerMode: true });
  assert.equal(result.exit, undefined); assert.match(result.output.join('\n'), /PASS completion lock/);
});
const releaseCases = [
  ['lock status', 'docs/contracts/ASSET_FACTORY_COMPLETION_LOCK.md', 'Status: **NOT LOCKED**', 'Status: **LOCKED**'],
  ['live evidence', 'docs/contracts/ASSET_FACTORY_COMPLETION_LOCK.md', 'LIVE_EVIDENCE_REQUIRED', 'LIVE_APPROVED'],
  ['privacy final review', 'docs/PRIVACY_SAFETY_VERIFICATION.md', 'Status: BLOCKED UNTIL FINAL REVIEW AND LIVE TEST EVIDENCE', 'Status: COMPLETE'],
  ['tenant isolation', 'docs/contracts/ASSET_FACTORY_COMPLETION_LOCK.md', 'Tenant isolation gate', 'Tenant isolation optional'],
  ['provider gate', 'docs/contracts/ASSET_FACTORY_COMPLETION_LOCK.md', 'Provider generation', 'Provider optional'],
  ['exact release validator', 'scripts/check-release-evidence.mjs', 'placeholder angle-bracket content remains in evidence file', 'placeholder content allowed'],
];
for (const [name, file, oldValue, value] of releaseCases) test('actual completion checker retains ' + name + ' rejection', async () => {
  const source = fs.readFileSync(path.join(root, file), 'utf8'); assert.ok(source.includes(oldValue));
  const result = await evaluate(checker, { checkerMode: true, files: { [file]: source.replaceAll(oldValue, value) } });
  assert.equal(result.exit, 1);
});
test('actual completion checker retains exact extended global script authority', async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  manifest.scripts['test:completion-lock'] = 'echo accepted';
  const result = await evaluate(checker, { checkerMode: true, files: { 'package.json': JSON.stringify(manifest) } });
  assert.equal(result.exit, 1);
});
