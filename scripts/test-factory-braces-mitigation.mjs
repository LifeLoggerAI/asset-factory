import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {installedGraph, match} from './check-installed-reviewed-advisories.mjs';
import {verifyFactoryBraces} from './verify-factory-braces-mitigation.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const importers = ['.', ...fs.readFileSync(path.join(root, 'pnpm-workspace.yaml'), 'utf8').split('\n').filter(line => /^  - /.test(line)).map(line => line.slice(4).trim())];
const graph = installedGraph(root, importers);
const bracesNodes = graph.nodes.filter(node => node.name === 'braces');
const rootRequire = createRequire(path.join(root, 'package.json'));
const semver = createRequire(rootRequire.resolve('firebase-admin'))('semver');
const clone = value => JSON.parse(JSON.stringify(value));

test('actual installed consumers accept bounded patterns and reject parser/AST nesting attacks', () => {
  const receipt = verifyFactoryBraces(root, graph);
  assert.equal(receipt.installedBehaviorVerified, true);
  assert.equal(receipt.rawHighFindingRetained, true);
  assert.equal(receipt.upstreamFixed, false);
  assert.equal(receipt.securityGateWaived, false);
  assert.equal(receipt.productionAcceptance, false);
  assert.equal(receipt.actualConsumerBindings.length, bracesNodes.length);
});
test('missing installed braces cannot produce mitigation evidence', () => {
  assert.throws(() => verifyFactoryBraces(root, {...graph, nodes: graph.nodes.filter(node => node.name !== 'braces')}), /actual installed braces required/);
});
test('unresolved required dependency remains fail-closed', () => {
  assert.throws(() => verifyFactoryBraces(root, {...graph, problems: [{name: 'missing-required'}]}), /all required installed dependencies/);
});
test('changed installed package version is not covered by this exact mitigation', () => {
  const changed = clone(graph); changed.nodes.find(node => node.name === 'braces').version = '3.0.4';
  assert.throws(() => verifyFactoryBraces(root, changed), /unexpected braces version/);
});
test('duplicate package observations cannot inflate coverage', () => {
  assert.throws(() => verifyFactoryBraces(root, {...graph, nodes: [...graph.nodes, bracesNodes[0]]}), /duplicate installed graph node/);
});
test('outside-checkout package references are rejected', () => {
  const changed = clone(graph); changed.nodes.find(node => node.name === 'braces').packagePath = '../urai-studio/package.json';
  assert.throws(() => verifyFactoryBraces(root, changed), /inside checkout|ENOENT/);
});
test('actual filesystem consumer evidence cannot be omitted', () => {
  assert.throws(() => verifyFactoryBraces(root, {...graph, nodes: graph.nodes.filter(node => node.name !== 'fast-glob')}), /actual filesystem-glob consumer required/);
});

function fixture(callback) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-braces-provenance-'));
  try {
    fs.cpSync(path.join(root, 'patches'), path.join(dir, 'patches'), {recursive: true});
    for (const file of ['package.json', 'pnpm-lock.yaml']) fs.copyFileSync(path.join(root, file), path.join(dir, file));
    const provenancePath = path.join(dir, 'patches/braces-3.0.3-provenance.json');
    callback(dir, provenancePath);
  } finally { fs.rmSync(dir, {recursive: true, force: true}); }
}
test('patch byte drift cannot be accepted from a matching version label', () => fixture(dir => {
  fs.appendFileSync(path.join(dir, 'patches/braces-3.0.3-security.patch'), 'tampered');
  assert.throws(() => verifyFactoryBraces(dir, {nodes: [], problems: []}), /AssertionError/);
}));
test('incomplete or traversal-containing runtime source tables are rejected', () => fixture((dir, provenancePath) => {
  const manifest = JSON.parse(fs.readFileSync(provenancePath)); manifest.files[0].path = '../constants.js';
  fs.writeFileSync(provenancePath, JSON.stringify(manifest));
  assert.throws(() => verifyFactoryBraces(dir, {nodes: [], problems: []}), /AssertionError/);
}));
test('raw upstream fixed claims are rejected', () => fixture((dir, provenancePath) => {
  const manifest = JSON.parse(fs.readFileSync(provenancePath)); manifest.upstreamPatchedVersion = '3.0.4';
  fs.writeFileSync(provenancePath, JSON.stringify(manifest));
  assert.throws(() => verifyFactoryBraces(dir, {nodes: [], problems: []}), /AssertionError/);
}));
test('altered installed guard body is rejected', () => fixture(dir => {
  const original = path.dirname(path.resolve(root, bracesNodes[0].packagePath));
  const target = path.join(dir, 'node_modules/braces'); fs.cpSync(original, target, {recursive: true});
  fs.appendFileSync(path.join(target, 'lib/parse.js'), '\n// drift');
  assert.throws(() => verifyFactoryBraces(dir, {nodes: [{...bracesNodes[0], packagePath: 'node_modules/braces/package.json'}], problems: []}), /installed runtime source/);
}));
test('local patch preserves original HIGH advisory rejection and never authorizes deployment', () => {
  const advisory = {id: 'GHSA-vfj7-8cjw-p6xm', database_specific: {severity: 'HIGH'}, affected: [{package: {ecosystem: 'npm', name: 'braces'}, ranges: [{type: 'SEMVER', events: [{introduced: '0'}, {last_affected: '3.0.3'}]}]}]};
  const result = match({nodes: bracesNodes, problems: []}, [advisory], semver);
  assert.equal(result.status, 'BLOCKED');
  assert.deepEqual(result.severeUniqueAdvisories, ['GHSA-vfj7-8cjw-p6xm']);
  assert.ok(result.findings.every(finding => finding.severity === 'high'));
});
