#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {installedGraph, match, primaryCommit as historicalPrimaryCommit} from './check-installed-reviewed-advisories.mjs';
export const currentPrimaryCommit = 'ccd4868bd8cfbed178f5ada1194b4fe30674c25b';
const root = fileURLToPath(new URL('../', import.meta.url));
const [checkout, output] = process.argv.slice(2);
if (!checkout || !output) throw new Error('Usage: node scripts/check-current-factory-reviewed-advisories.mjs OFFICIAL_CHECKOUT OUTPUT_JSON');
const actualCommit = execFileSync('git', ['-C', checkout, 'rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
if (actualCommit !== currentPrimaryCommit) throw new Error('Current official advisory source must be pinned to ' + currentPrimaryCommit);
execFileSync('git', ['-C', checkout, 'diff', '--exit-code', 'HEAD', '--', 'advisories/github-reviewed'], {stdio: 'pipe'});
const files = execFileSync('git', ['-C', checkout, 'ls-tree', '-r', '--name-only', 'HEAD', 'advisories/github-reviewed'], {encoding: 'utf8', maxBuffer: 16 * 1024 * 1024}).trim().split('\n');
function inventory(dir) {return fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => entry.isDirectory() ? inventory(path.join(dir, entry.name)) : entry.name.endsWith('.json') ? [path.relative(checkout, path.join(dir, entry.name))] : []);}
const actualFiles = inventory(path.join(checkout, 'advisories/github-reviewed')).sort();
if (JSON.stringify(actualFiles) !== JSON.stringify(files.sort())) throw new Error('Complete exact reviewed advisory scope is required');
const require = createRequire(path.join(root, 'package.json'));
const semver = createRequire(require.resolve('firebase-admin'))('semver');
const importers = ['.', ...fs.readFileSync(path.join(root, 'pnpm-workspace.yaml'), 'utf8').split('\n').filter(line => /^  - /.test(line)).map(line => line.slice(4).trim())];
const graph = installedGraph(root, importers);
// Match each complete official record with the unchanged independent comparator.
// Streaming avoids retaining the whole advisory corpus in the CI process heap.
const findings = [];
for (const file of files) findings.push(...match(graph, [JSON.parse(fs.readFileSync(path.join(checkout, file)))], semver).findings);
const severeUniqueAdvisories = [...new Set(findings.filter(item => ['high', 'critical'].includes(item.severity)).map(item => item.advisory))].sort();
const result = {status: graph.problems.length || severeUniqueAdvisories.length ? 'BLOCKED' : 'PASS_WITHIN_CURRENT_REVIEWED_SNAPSHOT', installedNodes: graph.nodes.length, graphProblems: graph.problems, severeUniqueAdvisories, findings, installedGraph: graph.nodes, primaryRepository: 'github/advisory-database', primaryCommit: currentPrimaryCommit, historicalPrimaryCommit, reviewedRecords: files.length, observedAt: new Date().toISOString(), method: 'Entire exact current reviewed primary JSON corpus matched locally against actual installed workspace manifests using the unchanged independent comparator; no graph upload, no exceptions, no security waiver.'};
fs.mkdirSync(path.dirname(output), {recursive: true});
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({status: result.status, installedNodes: result.installedNodes, severeUniqueAdvisories, graphProblems: graph.problems.length, primaryCommit: currentPrimaryCommit, reviewedRecords: files.length, output}));
process.exit(result.status === 'BLOCKED' ? 1 : 0);
