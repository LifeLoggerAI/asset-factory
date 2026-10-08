import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const script = fileURLToPath(new URL('./check-factory-all-severity.mjs', import.meta.url));
const report = () => ({primaryRepository: 'github/advisory-database', primaryCommit: 'synthetic-test-only', installedNodes: 1, reviewedRecords: 1, installedGraph: [{name: 'synthetic-test-only', version: '1.0.0'}], problems: [], findings: []});
function run(value) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-all-severity-'));
  try {
    const file = path.join(dir, 'synthetic-report.json');
    fs.writeFileSync(file, JSON.stringify(value));
    return spawnSync(process.execPath, [script, file], {encoding: 'utf8', timeout: 5000});
  } finally {fs.rmSync(dir, {recursive: true, force: true});}
}
test('additive all-severity gate accepts a complete empty finding set', () => assert.equal(run(report()).status, 0));
for (const severity of ['low', 'moderate', 'high', 'critical']) test('additive all-severity gate rejects an unresolved ' + severity + ' without exceptions', () => {
  const value = report();
  value.findings.push({name: 'synthetic-test-only', version: '1.0.0', advisory: 'synthetic-test-only', severity});
  assert.equal(run(value).status, 1);
});
test('additive gate rejects incomplete graph, missing findings, empty graph and incorrect primary source', () => {
  for (const change of [value => value.problems.push({problem: 'missing required dependency'}), value => delete value.findings, value => value.installedGraph.pop(), value => value.installedNodes = 0, value => value.reviewedRecords = 0, value => value.primaryRepository = 'untrusted']) {
    const value = report(); change(value); assert.equal(run(value).status, 1);
  }
});
