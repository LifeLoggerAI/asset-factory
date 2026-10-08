#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {installedGraph} from './check-installed-reviewed-advisories.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');
function listFiles(dir, relative = '') {
  return fs.readdirSync(path.join(dir, relative), {withFileTypes: true}).flatMap(entry => entry.isDirectory() ? listFiles(dir, path.join(relative, entry.name)) : [path.join(relative, entry.name)]).sort();
}
export function verifyFactoryGlobTooling(repositoryRoot = root) {
  const config = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'package.json')));
  const proof = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'patches/factory-glob-tooling-provenance.json')));
  assert.equal(proof.schemaVersion, 'urai-factory-glob-tooling-replacement-v1');
  assert.equal(proof.advisoryId, 'GHSA-vfj7-8cjw-p6xm');
  assert.equal(proof.securityGateWaived, false);
  assert.equal(hash(fs.readFileSync(path.join(repositoryRoot, proof.historicalMitigation.path))), proof.historicalMitigation.sha256);
  const studio = createRequire(path.join(repositoryRoot, 'assetfactory-studio/package.json'));
  const engine = createRequire(path.join(repositoryRoot, 'engine/package.json'));
  const depcheck = createRequire(engine.resolve('depcheck'));
  const consumers = [];
  for (const item of proof.consumers) {
    assert.equal(config.pnpm.patchedDependencies[item.package + '@' + item.version], item.patchPath);
    assert.equal(config.pnpm.overrides[item.package + '@' + item.version + '>' + item.removedDependency], '-');
    const replacements = item.replacementDependencies || {[item.replacementDependency]: item.replacementVersion};
    assert.deepEqual(config.pnpm.packageExtensions[item.package + '@' + item.version].dependencies, replacements);
    assert.equal(hash(fs.readFileSync(path.join(repositoryRoot, item.patchPath))), item.patchSha256);
    const require = item.package === 'findup-sync' ? depcheck : studio;
    const entry = require.resolve(item.package);
    const packageRoot = path.dirname(item.package === 'findup-sync' ? entry : path.dirname(entry));
    assert.ok(fs.realpathSync(packageRoot).startsWith(fs.realpathSync(repositoryRoot) + path.sep), 'Installed consumer must belong to this checkout');
    const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json')));
    assert.equal(manifest.name, item.package);
    assert.equal(manifest.version, item.version);
    assert.equal(manifest.dependencies[item.removedDependency], undefined);
    const moduleRequire = createRequire(path.join(packageRoot, 'package.json'));
    const actualReplacements = [];
    for (const [name, version] of Object.entries(replacements)) {
      assert.equal(manifest.dependencies[name], version);
      const replacement = JSON.parse(fs.readFileSync(moduleRequire.resolve(name + '/package.json')));
      assert.equal(replacement.name, name);
      assert.equal(replacement.version, version);
      actualReplacements.push(name + '@' + version);
    }
    if (item.package === '@next/eslint-plugin-next') assert.equal(manifest.dependencies.glob, undefined, 'The retired bundled glob runtime cannot remain a consumer ingress');
    assert.deepEqual(listFiles(packageRoot).filter(file => file === 'package.json' || file === 'index.js' || file.startsWith('dist' + path.sep)), item.files.map(file => file.path).sort());
    for (const file of item.files) assert.equal(hash(fs.readFileSync(path.join(packageRoot, file.path))), file.installedSha256, item.package + '/' + file.path);
    consumers.push({package: manifest.name, version: manifest.version, packageRoot: path.relative(repositoryRoot, packageRoot), replacements: actualReplacements, consumerScope: item.consumerScope || null, retiredBundledRuntime: item.retiredBundledRuntime || null, patchedFiles: item.files.filter(file => file.installedSha256 !== file.upstreamSha256).map(file => file.path), intactSourceFiles: item.files.filter(file => file.installedSha256 === file.upstreamSha256).length});
  }
  assert.equal(config.pnpm.patchedDependencies['braces@3.0.3'], undefined, 'Historical mitigation cannot authorize a new current graph');
  const importers = ['.', ...fs.readFileSync(path.join(repositoryRoot, 'pnpm-workspace.yaml'), 'utf8').split('\n').filter(line => /^  - /.test(line)).map(line => line.slice(4).trim())];
  const graph = installedGraph(repositoryRoot, importers);
  assert.deepEqual(graph.problems, [], 'Complete installed workspace graph is required');
  assert.deepEqual(graph.nodes.filter(node => ['braces', 'micromatch', 'fast-glob'].includes(node.name)), [], 'All affected tooling ingress must be genuinely absent');
  const head = execFileSync('git', ['-C', repositoryRoot, 'rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
  const tree = execFileSync('git', ['-C', repositoryRoot, 'rev-parse', 'HEAD^{tree}'], {encoding: 'utf8'}).trim();
  return {schemaVersion: proof.schemaVersion, head, tree, advisoryId: proof.advisoryId, pnpmLockSha256: hash(fs.readFileSync(path.join(repositoryRoot, 'pnpm-lock.yaml'))), installedNodes: graph.nodes.length, graphProblems: 0, actualAffectedPackages: [], consumers, localMitigationHistoryPreserved: true, securityGateWaived: false, upstreamBracesFixed: false, fullOfficialAdvisoryResultRequiredSeparately: true, providerAcceptance: false, productionAcceptance: false};
}
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = verifyFactoryGlobTooling();
  const output = path.join(root, 'artifacts/factory-glob-installed-replacement.json');
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
}
