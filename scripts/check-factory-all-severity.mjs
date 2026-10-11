// Adds closure at every severity without changing either original matcher/gate.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const files = process.argv.slice(2);
assert.ok(files.length > 0, 'Original complete installed security reports are required');
for (const file of files) {
  const report = JSON.parse(fs.readFileSync(file));
  assert.equal(report.primaryRepository, 'github/advisory-database');
  assert.ok(report.installedNodes > 0 && report.reviewedRecords > 0);
  assert.equal(report.installedGraph.length, report.installedNodes);
  assert.deepEqual(report.graphProblems ?? report.problems, [], 'Incomplete installed graph: ' + file);
  assert.deepEqual(report.findings, [], 'Unresolved installed advisories at any severity: ' + file);
  console.log(JSON.stringify({file, primaryCommit: report.primaryCommit, installedNodes: report.installedNodes, reviewedRecords: report.reviewedRecords, findings: 0, scope: 'Every severity in the exact complete retained official snapshot'}));
}
