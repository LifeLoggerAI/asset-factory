// Executes the actual published callers with maintained replacement APIs.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {verifyFactoryDependencyRemediation} from './verify-factory-dependency-remediation.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const baselineRoot = process.env.URAI_DEPENDENCY_BASELINE_ROOT;
assert.ok(baselineRoot, 'Exact published upstream comparison packages are required');
const baseline = createRequire(path.join(baselineRoot, 'package.json'));
const probeRoot = process.env.URAI_DEPENDENCY_CANDIDATE_PROBE_ROOT;
const candidate = createRequire(path.join(probeRoot || root, probeRoot ? 'package.json' : 'functions/package.json'));
const yamlRequire = probeRoot ? candidate : createRequire(createRequire(path.join(root, 'engine/package.json')).resolve('depcheck'));
const uuidRequire = probeRoot ? candidate : createRequire(path.join(root, 'engine/package.json'));
const packageRoot = (require, name) => path.dirname(require.resolve(name + '/package.json'));
const firebaseRoot = require => path.dirname(path.dirname(require.resolve('firebase-functions-test')));
const hash = value => createHash('sha256').update(value).digest('hex');
const actualCallerNodes = () => [
  {name: 'firebase-functions-test', version: '3.4.1', packagePath: path.relative(root, path.join(firebaseRoot(candidate), 'package.json'))},
  {name: 'js-yaml', version: '3.15.2', packagePath: path.relative(root, path.join(packageRoot(yamlRequire, 'js-yaml'), 'package.json'))},
];

test('new installed source verifier executes against the two actual caller packages and supported dependencies', () => {
  // This focused caller proof is separate from the full native installed graph.
  const result = verifyFactoryDependencyRemediation(root, {nodes: actualCallerNodes(), problems: []});
  assert.equal(result.consumers.length, 2);
  assert.equal(result.securityGateWaived, false);
});
test('new source verifier rejects missing consumers, incomplete graph and retained vulnerable ingress', () => {
  assert.throws(() => verifyFactoryDependencyRemediation(root, {nodes: actualCallerNodes().slice(1), problems: []}));
  assert.throws(() => verifyFactoryDependencyRemediation(root, {nodes: actualCallerNodes(), problems: [{problem: 'required package missing'}]}));
  for (const node of [{name: 'sprintf-js', version: '1.0.3'}, {name: 'argparse', version: '1.0.10'}, {name: 'ts-deepmerge', version: '2.0.7'}]) {
    assert.throws(() => verifyFactoryDependencyRemediation(root, {nodes: [...actualCallerNodes(), node], problems: []}));
  }
});

test('all actual patched caller source and license bytes match the independent public tarball provenance', () => {
  const proof = JSON.parse(fs.readFileSync(path.join(root, 'patches/factory-supported-dependencies-provenance.json')));
  for (const item of proof.consumers) {
    const before = item.package === 'js-yaml' ? packageRoot(baseline, item.package) : firebaseRoot(baseline);
    const after = item.package === 'js-yaml' ? packageRoot(yamlRequire, item.package) : firebaseRoot(candidate);
    for (const file of item.files) {
      assert.equal(hash(fs.readFileSync(path.join(before, file.path))), file.upstreamSha256, item.package + '/' + file.path + ' upstream');
      assert.equal(hash(fs.readFileSync(path.join(after, file.path))), file.installedSha256, item.package + '/' + file.path + ' candidate');
    }
  }
});

const beforeYaml = baseline('js-yaml');
const afterYaml = yamlRequire('js-yaml');
for (const [label, input] of [
  ['nested mappings, arrays, unicode and anchors', 'title: 日本語\nitems: [1, true, null]\ncommon: &base { x: 2 }\nalias: *base\n'],
  ['multiple documents', '---\na: 1\n---\nb: [two, three]\n'],
  ['empty input', ''],
  ['quoted strings and timestamps', 'quoted: "1"\ndate: 2026-10-08\n'],
]) test('unchanged actual YAML3 loader/dumper: ' + label, () => {
  const before = [], after = [];
  beforeYaml.loadAll(input, value => before.push(value));
  afterYaml.loadAll(input, value => after.push(value));
  assert.deepEqual(after, before);
  for (const value of before) assert.equal(afterYaml.dump(value), beforeYaml.dump(value));
  assert.deepEqual(afterYaml.safeLoadAll(input), beforeYaml.safeLoadAll(input));
});

function cli(require, args, input, cwd) {
  return spawnSync(process.execPath, [path.join(packageRoot(require, 'js-yaml'), 'bin/js-yaml.js'), ...args], {input, encoding: 'utf8', cwd, timeout: 5000});
}
// Runtime preload diagnostics can include a different PID for each child.
// Retain every diagnostic byte except that nondeterministic process identifier.
const diagnostic = text => text.replace(/^\(node:\d+\) /gm, '(node:<pid>) ');
for (const [label, args, input] of [
  ['stdin YAML to JSON', [], 'a: 1\nb: [two, three]\n'],
  ['JSON to YAML', [], '{"a":1,"b":["two",true]}'],
  ['explicit stdin', ['-'], 'a: 1\n'],
  ['deprecated JSON option remains accepted', ['--to-json'], 'a: 1\n'],
  ['compact parse error', ['--compact'], 'x: [\n'],
  ['short version', ['-v'], ''],
  ['long version', ['--version'], ''],
]) test('actual maintained argparse CLI preserves ' + label, () => {
  const before = cli(baseline, args, input), after = cli(yamlRequire, args, input);
  assert.equal(after.error, undefined, after.error?.message);
  assert.equal(after.status, before.status);
  assert.equal(after.stdout, before.stdout);
  assert.equal(diagnostic(after.stderr), diagnostic(before.stderr));
});

test('actual CLI preserves file reads, missing-file exit2, malformed input exit1, help and invalid option refusal', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-yaml-compat-'));
  try {
    fs.writeFileSync(path.join(dir, 'input.yaml'), 'a: [one, two]\n');
    for (const args of [['input.yaml'], ['missing.yaml']]) {
      const before = cli(baseline, args, '', dir), after = cli(yamlRequire, args, '', dir);
      assert.equal(after.status, before.status);
      assert.equal(after.stdout, before.stdout);
      assert.equal(diagnostic(after.stderr), diagnostic(before.stderr));
    }
    const help = cli(yamlRequire, ['--help'], '', dir);
    assert.equal(help.status, 0);
    for (const flag of ['--version', '--compact', '--trace']) assert.ok(help.stdout.includes(flag));
    assert.equal(diagnostic(help.stderr), diagnostic(cli(baseline, ['--help'], '', dir).stderr));
    assert.equal(cli(yamlRequire, ['--unknown'], '', dir).status, 2);
    assert.equal(cli(yamlRequire, [], 'x: [\n', dir).status, 1);
  } finally {fs.rmSync(dir, {recursive: true, force: true});}
});

// Only the event partial registry is controlled; the real caller and merge execute.
// Native CI uses the installed Firebase SDK classes. The explicitly scoped local
// public-source probe substitutes class identities, without account/network use.
class DataSnapshot {};
class DocumentSnapshot {};
class QueryDocumentSnapshot {};
class Change {constructor(before, after) {this.before = before; this.after = after;}}
class Message {};
const sdk = probeRoot ? {
  'firebase-functions/v2': {database: {DataSnapshot}, pubsub: {Message}},
  'firebase-admin/firestore': {DocumentSnapshot, QueryDocumentSnapshot},
  'firebase-functions/v1': {Change},
} : Object.fromEntries(['firebase-functions/v2', 'firebase-admin/firestore', 'firebase-functions/v1'].map(name => [name, candidate(name)]));
function generate(require, generated, partial) {
  const file = path.join(firebaseRoot(require), 'lib/cloudevent/generate.js');
  const callerRequire = createRequire(file);
  const module = {exports: {}};
  const load = name => name === './mocks/partials'
    ? {LIST_OF_MOCK_CLOUD_EVENT_PARTIALS: [{match: () => true, generateMock: () => generated}]}
    : sdk[name] ?? callerRequire(name);
  vm.runInThisContext('(function(exports,require,module){' + fs.readFileSync(file, 'utf8') + '\n})', {filename: file})(module.exports, load, module);
  return module.exports.generateCombinedCloudEvent({}, partial);
}
for (const [label, generated, partial] of [
  ['nested scalar replacement', {id: 'a', data: {x: 1, keep: true}}, {data: {x: 2}, subject: 'b'}],
  ['unique ordered arrays', {data: {values: ['a', 'b']}}, {data: {values: ['b', 'c']}}],
  ['undefined override remains supported', {id: 'a', data: {x: 1}}, {id: undefined}],
  ['empty override', {id: 'a'}, {}],
  ['absent override', {id: 'a'}, undefined],
]) test('actual Firebase CloudEvent generator preserves ' + label, () => {
  assert.deepEqual(generate(candidate, structuredClone(generated), structuredClone(partial)), generate(baseline, structuredClone(generated), structuredClone(partial)));
});

test('actual Firebase generator retains immutable SDK Change data and supplied Change instances', () => {
  const ActualChange = sdk['firebase-functions/v1'].Change;
  const immutable = new ActualChange({x: 1}, {x: 2});
  const result = generate(candidate, {data: immutable}, {data: {x: 3}, subject: 'same'});
  assert.equal(result.data, immutable);
  const supplied = new ActualChange({x: 4}, {x: 5});
  assert.equal(generate(candidate, {data: {}}, {data: supplied}).data, supplied);
});

test('maintained merge removes attacker-supplied prototype method shadowing at the actual Firebase caller', () => {
  const input = JSON.parse('{"data":{"toString":"poison","valueOf":"poison","hasOwnProperty":"poison","safe":1}}');
  const before = generate(baseline, {data: {}}, structuredClone(input));
  const after = generate(candidate, {data: {}}, structuredClone(input));
  assert.equal(before.data.toString, 'poison', 'Published predecessor exposes the actual regression');
  assert.equal(after.data.safe, 1);
  for (const key of ['toString', 'valueOf', 'hasOwnProperty']) assert.equal(Object.hasOwn(after.data, key), false);
  assert.equal(Object.getPrototypeOf(after.data), Object.prototype);
});

test('uuid11 retains the real engine/CommonJS v4 API, byte offsets and supported deterministic names', () => {
  const uuid = uuidRequire('uuid');
  const random = Uint8Array.from({length: 16}, (_, i) => i);
  assert.equal(uuid.v4({random}), '00010203-0405-4607-8809-0a0b0c0d0e0f');
  assert.ok(uuid.validate(uuid.v4()));
  const bytes = new Uint8Array(20);
  assert.equal(uuid.v4({random}, bytes, 2), bytes);
  assert.equal(uuid.stringify(bytes, 2), '00010203-0405-4607-8809-0a0b0c0d0e0f');
  assert.equal(uuid.v5('hello', uuid.v5.DNS), '9342d47a-1bab-5709-9869-c840b2eac501');
  assert.throws(() => uuid.v5('hello', uuid.v5.DNS, new Uint8Array(15)), RangeError);
  assert.throws(() => uuid.v3('hello', uuid.v3.DNS, new Uint8Array(16), 1), RangeError);
  assert.equal(typeof uuid.v4, 'function');
});
