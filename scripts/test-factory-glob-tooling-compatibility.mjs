// Actual upstream-versus-replacement tool behavior; no provider/account authority.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const baselineRoot = process.env.URAI_GLOB_BASELINE_ROOT;
assert.ok(baselineRoot, 'Pinned upstream comparison tools are required');
const baseline = createRequire(path.join(baselineRoot, 'package.json'));
const probeRoot = process.env.URAI_GLOB_REPLACEMENT_PROBE_ROOT;
const studio = createRequire(path.join(probeRoot || root, probeRoot ? 'package.json' : 'assetfactory-studio/package.json'));
const engine = createRequire(path.join(probeRoot || root, probeRoot ? 'package.json' : 'engine/package.json'));
const originalRoots = baseline('@next/eslint-plugin-next/dist/utils/get-root-dirs.js').getRootDirs;
const repairedRoots = studio('@next/eslint-plugin-next/dist/utils/get-root-dirs.js').getRootDirs;
const originalFind = baseline('findup-sync');
const repairedFindRequire = probeRoot ? engine : createRequire(engine.resolve('depcheck'));
const repairedFind = repairedFindRequire('findup-sync');
const originalMatcher = baseline('micromatch').matcher;
const repairedMatcher = createRequire(repairedFindRequire.resolve('findup-sync'))('picomatch');
const ordered = values => [...values].sort();

function fixture(callback) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-glob-compat-'));
  try {
    for (const name of ['apps/client/pages', 'apps/server/pages', 'apps/client/deep', 'apps/.hidden/pages', 'other/pages', 'empty', 'nested/child']) fs.mkdirSync(path.join(dir, name), {recursive: true});
    for (const name of ['apps/a-file.txt', 'apps/client/pages/index.js', 'apps/server/pages/about.js', 'nested/config.js', 'config.json', '.babelrc', 'config.2.json', 'CASE.JSON']) fs.writeFileSync(path.join(dir, name), 'fixture');
    fs.symlinkSync(path.join(dir, 'apps/client'), path.join(dir, 'apps/client-link'), 'dir');
    return callback(dir);
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
}
function context(cwd, rootDir) {return {cwd, settings: {next: rootDir === undefined ? {} : {rootDir}}};}

test('actual Next root discovery preserves literal directories, root, misses and default cwd', () => fixture(dir => {
  for (const value of [undefined, dir, dir + '/', '/', path.join(dir, 'empty'), path.join(dir, 'absent'), path.join(dir, 'apps/a-file.txt')]) {
    assert.deepEqual(repairedRoots(context(dir, value)), originalRoots(context(dir, value)), String(value));
  }
}));
test('actual Next directory glob selection preserves roots and excludes files across supported patterns', () => fixture(dir => {
  const patterns = ['apps/*', 'apps/**', 'apps/*/pages', 'apps/{client,server}', 'apps/@(client|server)', 'apps/client*', 'apps/?erver', 'apps/[cs]*', 'apps/.hidden', '!apps/*', 'missing/**', 'apps/*/'];
  for (const suffix of patterns) {
    const value = path.join(dir, suffix);
    assert.deepEqual(ordered(repairedRoots(context(dir, value))), ordered(originalRoots(context(dir, value))), suffix);
  }
}));
test('actual Next arrays and normalized separators retain caller roots and non-string filtering', () => fixture(dir => {
  for (const value of [[path.join(dir, 'apps/*'), path.join(dir, 'other')], [null, 17, path.join(dir, 'empty')], path.join(dir, 'apps/*').replaceAll('/', '\\')]) {
    assert.deepEqual(ordered(repairedRoots(context(dir, value))), ordered(originalRoots(context(dir, value))));
  }
}));
test('actual findup preserves literal nearest ancestor, ordered candidates, missing paths and symbolic paths', () => fixture(dir => {
  const cwd = path.join(dir, 'nested/child');
  for (const patterns of ['config.js', 'config.json', ['config.js', 'config.json'], ['absent.json', '.babelrc'], 'absent', 'apps/client-link/pages/index.js']) {
    assert.equal(repairedFind(patterns, {cwd}), originalFind(patterns, {cwd}), JSON.stringify(patterns));
  }
  assert.throws(() => repairedFind(4, {cwd}), TypeError);
}));
test('actual findup glob and option behavior preserves dependency-audit configuration lookup', () => fixture(dir => {
  const cwd = path.join(dir, 'nested/child');
  for (const [pattern, options] of [['config.{js,json}', {}], ['*.json', {}], ['*.JSON', {nocase: true}], ['.*', {dot: true}], ['config.@(js|json)', {}], ['config.{1..3}.json', {}], ['!(absent).json', {}]]) {
    assert.equal(repairedFind(pattern, {cwd, ...options}), originalFind(pattern, {cwd, ...options}), pattern);
  }
}));
test('actual matcher compatibility retains relevant extglob, range, dot, case and basename semantics', () => {
  const candidates = ['a.js', 'b.ts', '.hidden.js', 'config.1.json', 'config.2.json', 'config.4.json', 'foo/bar.js', 'CASE.JSON', 'report.txt', '日本語.json', 'a(b).json'];
  const patterns = ['*.{js,ts}', '*.{json,js}', 'config.{1..3}.json', '@(a|b).*', '!(a).js', '**/*.js', '*.json', '.*', '[ab].*', '日本語.*'];
  for (const options of [{}, {dot: true}, {nocase: true}, {matchBase: true}, {noext: true}, {nonegate: true}]) {
    for (const pattern of patterns) {
      const before = originalMatcher(pattern, options), after = repairedMatcher(pattern, options);
      for (const candidate of candidates) assert.equal(after(candidate), before(candidate), JSON.stringify({pattern, candidate, options}));
    }
  }
});
test('actual replacement matcher and root discovery bound deeply nested pattern outcomes without stack exhaustion', () => {
  const findPath = repairedFindRequire.resolve('findup-sync');
  const rootPath = studio.resolve('@next/eslint-plugin-next/dist/utils/get-root-dirs.js');
  const code = `const fs=require('fs');const {createRequire}=require('module');const f=require(${JSON.stringify(findPath)});const p=createRequire(${JSON.stringify(findPath)})('picomatch');const g=require(${JSON.stringify(rootPath)}).getRootDirs;for(const n of [129,4000]){for(const [o,c] of [['{','}'],['(',')']]){const pattern=o.repeat(n)+'x'+c.repeat(n);for(const call of [()=>p(pattern)('x'),()=>f(pattern,{cwd:process.cwd()}),()=>g({cwd:process.cwd(),settings:{next:{rootDir:pattern}}})]){try{call()}catch(e){if(e.name==='RangeError')throw e;}}}}`;
  const result = spawnSync(process.execPath, ['--max-old-space-size=128', '-e', code], {cwd: os.tmpdir(), timeout: 8_000, encoding: 'utf8'});
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr);
});
test('Next plugin retains every lint rule and recommended rule setting', () => {
  const before = baseline('@next/eslint-plugin-next'), after = studio('@next/eslint-plugin-next');
  assert.deepEqual(Object.keys(after.rules).sort(), Object.keys(before.rules).sort());
  for (const key of Object.keys(before.configs)) assert.deepEqual(after.configs[key].rules, before.configs[key].rules);
});


test('actual dependency audit retains used, unused, missing and configured-parser findings', async () => {
  const before = baseline('depcheck'), after = engine('depcheck');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-depcheck-compat-'));
  try {
    fs.mkdirSync(path.join(dir, 'nested'));
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({name: 'audit-fixture', dependencies: {used: '1.0.0', unused: '1.0.0'}, devDependencies: {unuseddev: '1.0.0'}}));
    fs.writeFileSync(path.join(dir, 'nested/index.js'), "const used = require('used'); const missing = require('missing'); module.exports={used,missing};\n");
    const normalize = result => JSON.parse(JSON.stringify(result));
    const original = normalize(await before(dir, {})), repaired = normalize(await after(dir, {}));
    assert.deepEqual(repaired, original);
    assert.deepEqual(repaired.dependencies, ['unused']);
    assert.deepEqual(repaired.devDependencies, ['unuseddev']);
    assert.ok(repaired.missing.missing.some(file => file.endsWith('/nested/index.js')));
    // Keep the actual engine's extant findings; this is comparison, not an ignore list.
    assert.deepEqual(normalize(await after(path.join(root, 'engine'), {})), normalize(await before(path.join(root, 'engine'), {})));
  } finally {fs.rmSync(dir, {recursive: true, force: true});}
});

test('actual ESLint emits identical Next link diagnostics for literal, glob and symlink roots', () => fixture(dir => {
  const {Linter} = studio('eslint');
  for (const suffix of ['apps/client', 'apps/*', 'apps/**', 'apps/client-link', 'apps/{client,server}', 'apps/@(client|server)']) {
    const configuration = plugin => [{files: ['**/*.jsx'], languageOptions: {ecmaVersion: 2022, sourceType: 'module', parserOptions: {ecmaFeatures: {jsx: true}}}, settings: {next: {rootDir: path.join(dir, suffix)}}, plugins: {next: plugin}, rules: {'next/no-html-link-for-pages': 'error'}}];
    const sample = 'export default () => <><a href="/">Home</a><a href="/about">About</a><a href="https://example.com/">External</a><a href="/" download>Download</a></>;' ;
    const messages = plugin => new Linter({cwd: dir}).verify(sample, configuration(plugin), {filename: 'fixture.jsx'});
    const original = messages(baseline('@next/eslint-plugin-next')), repaired = messages(studio('@next/eslint-plugin-next'));
    assert.deepEqual(repaired, original, suffix);
    assert.ok(repaired.some(message => message.ruleId === 'next/no-html-link-for-pages'), suffix);
  }
}));
