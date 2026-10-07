import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {test} from 'node:test';
import {affected, installedGraph, match} from './check-installed-reviewed-advisories.mjs';

const require = createRequire(import.meta.url);
const semver = createRequire(require.resolve('firebase-admin'))('semver');
test('official affected intervals reject fixed versions and retain inclusive last-affected boundaries', () => {
  const range = {ranges: [{type: 'ECOSYSTEM', events: [{introduced: '1'}, {fixed: '1.2.2'}]}]};
  assert.equal(affected('1.2.1', range, semver), true);
  assert.equal(affected('1.2.2', range, semver), false);
  assert.equal(affected('1.2.2', {ranges: [{type: 'SEMVER', events: [{introduced: '0'}, {last_affected: '1.2.2'}]}]}, semver), true);
  assert.throws(() => affected('1.2.1', {ranges: [{type: 'UNKNOWN', events: []}]}, semver));
});
test('installed source resolves actual bytes rather than requested ranges; missing dependencies block', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'installed-advisory-'));
  try {
    fs.mkdirSync(path.join(root, 'node_modules/example'), {recursive: true});
    fs.mkdirSync(path.join(root, 'node_modules/string_decoder'), {recursive: true});
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({dependencies: {example: '^1', string_decoder: '^1', absent: '^2'}}));
    fs.writeFileSync(path.join(root, 'node_modules/example/package.json'), JSON.stringify({name: 'example', version: '1.2.1'}));
    fs.writeFileSync(path.join(root, 'node_modules/string_decoder/package.json'), JSON.stringify({name: 'string_decoder', version: '1.3.0'}));
    const graph = installedGraph(root, ['.']);
    assert.equal(graph.nodes[0].version, '1.2.1');
    assert.equal(graph.nodes.length, 2);
    assert.equal(graph.problems.length, 1);
    assert.equal(match(graph, [], semver).status, 'BLOCKED');
    const alias = root + '-alias';
    fs.symlinkSync(root, alias, 'dir');
    try {
      const throughAlias = installedGraph(alias, ['.']);
      assert.equal(throughAlias.nodes.length, 2);
      assert.equal(throughAlias.problems.length, 1);
    } finally { fs.unlinkSync(alias); }
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});
test('high findings fail closed, withdrawn records are excluded, and missing severity cannot pass', () => {
  const graph = {nodes: [{name: 'example', version: '1.2.1'}], problems: []};
  const advisory = {id: 'GHSA-fixture', database_specific: {severity: 'HIGH'}, affected: [{package: {ecosystem: 'npm', name: 'example'}, ranges: [{type: 'SEMVER', events: [{introduced: '0'}, {fixed: '1.2.2'}]}]}]};
  assert.equal(match(graph, [advisory], semver).status, 'BLOCKED');
  assert.equal(match(graph, [{...advisory, withdrawn: '2026-10-07'}], semver).status, 'PASS_WITHIN_RETAINED_REVIEWED_SNAPSHOT');
  assert.throws(() => match(graph, [{...advisory, database_specific: {}}], semver));
});
