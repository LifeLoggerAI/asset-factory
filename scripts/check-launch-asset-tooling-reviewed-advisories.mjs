#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { installedGraph, match, primaryCommit } from './check-installed-reviewed-advisories.mjs';

const currentPrimaryCommit = '4a4d987c2a10120439be63a222087d94dd54f719';
const importer = 'model_forge/launch-asset-preparation/v1';
const root = fs.realpathSync(fileURLToPath(new URL('../', import.meta.url)));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (checkout, args) => execFileSync('git', ['-C', checkout, ...args], {
  encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
});

function reviewedSnapshot(checkout, expectedCommit) {
  checkout = fs.realpathSync(checkout);
  const actualCommit = git(checkout, ['rev-parse', 'HEAD']).trim();
  if (actualCommit !== expectedCommit) throw new Error('Exact pinned official advisory commit required: ' + expectedCommit);
  git(checkout, ['diff', '--exit-code', 'HEAD', '--', 'advisories/github-reviewed']);
  const files = git(checkout, ['ls-tree', '-r', '--name-only', 'HEAD', 'advisories/github-reviewed'])
    .trim().split('\n').filter(Boolean).sort();
  if (!files.length || files.some(file => !file.endsWith('.json'))) throw new Error('Complete reviewed JSON corpus required');
  function inventory(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
      ? inventory(path.join(dir, entry.name))
      : entry.name.endsWith('.json') ? [path.relative(checkout, path.join(dir, entry.name))] : []);
  }
  const actualFiles = inventory(path.join(checkout, 'advisories/github-reviewed')).sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(files)) throw new Error('Exact complete reviewed advisory inventory required');
  return { checkout, primaryCommit: actualCommit, files };
}

const [historicalCheckout, currentCheckout, output] = process.argv.slice(2);
if (!historicalCheckout || !currentCheckout || !output || process.argv.length !== 5) {
  throw new Error('Usage: EXACT_SOURCE_SHA=HEAD node scripts/check-launch-asset-tooling-reviewed-advisories.mjs HISTORICAL_CHECKOUT CURRENT_CHECKOUT OUTPUT_JSON');
}
const head = git(root, ['rev-parse', 'HEAD']).trim();
const tree = git(root, ['rev-parse', 'HEAD^{tree}']).trim();
if (process.env.EXACT_SOURCE_SHA !== head) throw new Error('Exact source head binding required');
git(root, ['diff', '--exit-code', 'HEAD', '--', importer, 'scripts/check-installed-reviewed-advisories.mjs', 'scripts/check-launch-asset-tooling-reviewed-advisories.mjs']);
const snapshots = [reviewedSnapshot(historicalCheckout, primaryCommit), reviewedSnapshot(currentCheckout, currentPrimaryCommit)];
const manifestPath = path.join(root, importer, 'package.json');
const lockPath = path.join(root, importer, 'package-lock.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath));
if (!Object.keys(manifest.dependencies ?? {}).length) throw new Error('Declared standalone runtime dependencies required');
const graph = installedGraph(root, [importer]);
if (!graph.nodes.length) throw new Error('Actual standalone installed graph must not be empty');
const require = createRequire(manifestPath);
const semverPath = fs.realpathSync(require.resolve('semver/package.json'));
const semverRelativePath = path.relative(root, semverPath);
if (!graph.nodes.some(node => node.packagePath === semverRelativePath && node.name === 'semver')) {
  throw new Error('Comparator semver must belong to this actual standalone installed graph');
}
const semver = require('semver');
const reports = snapshots.map(snapshot => {
  const findings = [];
  for (const file of snapshot.files) {
    findings.push(...match(graph, [JSON.parse(fs.readFileSync(path.join(snapshot.checkout, file)))], semver).findings);
  }
  return {
    primaryRepository: 'github/advisory-database', primaryCommit: snapshot.primaryCommit,
    reviewedRecords: snapshot.files.length, findings,
    severeUniqueAdvisories: [...new Set(findings.filter(item => ['high', 'critical'].includes(item.severity)).map(item => item.advisory))].sort(),
    status: graph.problems.length || findings.length ? 'BLOCKED' : 'PASS_ALL_SEVERITIES_WITHIN_REVIEWED_SNAPSHOT',
  };
});
const result = {
  schemaVersion: 'urai-launch-asset-tooling-installed-primary-security-v1',
  observedAt: new Date().toISOString(), head, tree, node: process.version, platform: process.platform, arch: process.arch,
  importer, manifestSha256: sha256(fs.readFileSync(manifestPath)), lockSha256: sha256(fs.readFileSync(lockPath)),
  comparatorSha256: sha256(fs.readFileSync(path.join(root, 'scripts/check-installed-reviewed-advisories.mjs'))),
  comparatorSemver: { version: JSON.parse(fs.readFileSync(semverPath)).version, packagePath: semverRelativePath },
  installedNodes: graph.nodes.length, installedGraph: graph.nodes, graphProblems: graph.problems, reports,
  status: reports.some(report => report.status === 'BLOCKED') ? 'BLOCKED' : 'PASS_ALL_SEVERITIES_WITHIN_BOTH_REVIEWED_SNAPSHOTS',
  method: 'Actual separately installed standalone NPM manifests and entire exact primary reviewed corpora; unchanged independent comparator. No dependency graph sent to a registry or advisory service; no exceptions or advisory suppression.',
  securityGateWaived: false, providerCallsExecuted: 0, humanIndependentApproval: false, assetProductionAcceptance: false,
};
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ status: result.status, head, importer, installedNodes: result.installedNodes,
  graphProblems: result.graphProblems.length, snapshots: reports.map(report => ({ primaryCommit: report.primaryCommit,
    reviewedRecords: report.reviewedRecords, findings: report.findings.length })), output }));
process.exitCode = result.status === 'BLOCKED' ? 1 : 0;
