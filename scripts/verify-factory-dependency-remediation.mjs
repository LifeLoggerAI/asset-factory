import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';

const hash = value => createHash('sha256').update(value).digest('hex');
export function verifyFactoryDependencyRemediation(repositoryRoot, graph) {
  const root = fs.realpathSync(repositoryRoot);
  const config = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
  const proof = JSON.parse(fs.readFileSync(path.join(root, 'patches/factory-supported-dependencies-provenance.json')));
  assert.equal(proof.schemaVersion, 'urai-factory-supported-dependency-remediation-v1');
  assert.equal(proof.securityGateWaived, false);
  assert.equal(proof.originalMatcherUnchanged, true);
  assert.deepEqual(graph.problems, [], 'Every required workspace/deployment dependency must be installed in this checkout');
  const consumers = [];
  for (const item of proof.consumers) {
    assert.equal(config.pnpm.patchedDependencies[item.package + '@' + item.version], item.patchPath);
    assert.equal(config.pnpm.overrides[item.package + '@' + item.version + '>' + item.replacementDependency], item.replacementVersion);
    assert.equal(hash(fs.readFileSync(path.join(root, item.patchPath))), item.patchSha256);
    const nodes = graph.nodes.filter(node => node.name === item.package && node.version === item.version);
    assert.ok(nodes.length > 0, 'The real patched consumer must be installed: ' + item.package);
    for (const node of nodes) {
      const manifestPath = fs.realpathSync(path.join(root, node.packagePath));
      assert.ok(manifestPath.startsWith(root + path.sep));
      const manifest = JSON.parse(fs.readFileSync(manifestPath));
      assert.equal(manifest.dependencies[item.replacementDependency], item.replacementVersion);
      const require = createRequire(manifestPath);
      const replacementEntry = require.resolve(item.replacementDependency);
      let dependencyRoot = path.dirname(replacementEntry);
      while (!fs.existsSync(path.join(dependencyRoot, 'package.json'))) {
        const parent = path.dirname(dependencyRoot);
        assert.notEqual(parent, dependencyRoot, 'Replacement must have a genuine package manifest');
        dependencyRoot = parent;
      }
      // ts-deepmerge's cjs directory has its own type-only manifest.
      let replacement = JSON.parse(fs.readFileSync(path.join(dependencyRoot, 'package.json')));
      if (!replacement.name) {
        dependencyRoot = path.dirname(dependencyRoot);
        replacement = JSON.parse(fs.readFileSync(path.join(dependencyRoot, 'package.json')));
      }
      assert.ok(fs.realpathSync(dependencyRoot).startsWith(root + path.sep));
      assert.equal(replacement.name, item.replacementDependency);
      assert.equal(replacement.version, item.replacementVersion);
      for (const file of item.files) assert.equal(hash(fs.readFileSync(path.join(path.dirname(manifestPath), file.path))), file.installedSha256, item.package + '/' + file.path);
      consumers.push({package: item.package, version: item.version, packagePath: node.packagePath, replacement: replacement.name + '@' + replacement.version, intactSourceFiles: item.files.filter(file => file.installedSha256 === file.upstreamSha256).length, changedFiles: item.files.filter(file => file.installedSha256 !== file.upstreamSha256).map(file => file.path)});
    }
  }
  assert.deepEqual(graph.nodes.filter(node => node.name === 'sprintf-js' || node.name === 'argparse' && node.version.startsWith('1.') || node.name === 'ts-deepmerge' && node.version.startsWith('2.')), [], 'Vulnerable formatter/parser and old merge ingress must be genuinely absent');
  return {schemaVersion: proof.schemaVersion, consumers, removedIngress: ['sprintf-js', 'argparse@1', 'ts-deepmerge@2'], securityGateWaived: false, fullCurrentInstalledAdvisoryProofRequired: true};
}
