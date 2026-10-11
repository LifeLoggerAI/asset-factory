import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {installedGraph} from './check-installed-reviewed-advisories.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const expectedFiles = ['lib/constants.js', 'lib/parse.js', 'lib/compile.js', 'lib/expand.js', 'lib/stringify.js'];

export function verifyFactoryBraces(repositoryRoot, graph) {
  const root = fs.realpathSync(repositoryRoot);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'patches/braces-3.0.3-provenance.json')));
  assert.equal(manifest.schemaVersion, 'urai-factory-braces-local-mitigation-v1');
  assert.equal(manifest.advisoryId, 'GHSA-vfj7-8cjw-p6xm');
  assert.equal(manifest.upstreamPackage, 'braces');
  assert.equal(manifest.upstreamVersion, '3.0.3');
  assert.equal(manifest.upstreamPatchedVersion, null);
  assert.equal(manifest.maximumDepth, 128);
  assert.deepEqual(manifest.files.map(item => item.path).sort(), [...expectedFiles].sort());
  assert.equal(manifest.patchPath, 'patches/braces-3.0.3-security.patch');
  assert.equal(hash(fs.readFileSync(path.join(root, manifest.patchPath))), manifest.patchSha256);
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
  assert.equal(packageJson.pnpm.patchedDependencies['braces@3.0.3'], manifest.patchPath);
  const lock = fs.readFileSync(path.join(root, 'pnpm-lock.yaml'));
  assert.ok(lock.toString().includes(manifest.upstreamIntegrity), 'original upstream integrity retained');
  assert.equal(graph.problems.length, 0, 'all required installed dependencies must resolve');
  const nodes = graph.nodes.filter(node => node.name === 'braces');
  assert.ok(nodes.length, 'actual installed braces required');
  const bindings = [];
  const verified = new Set();
  for (const node of nodes) {
    assert.equal(node.version, '3.0.3', 'unexpected braces version requires separate review');
    const packagePath = fs.realpathSync(path.resolve(root, node.packagePath));
    assert.ok(packagePath.startsWith(root + path.sep), 'installed package must be inside checkout');
    assert.ok(!verified.has(packagePath), 'duplicate installed graph node');
    verified.add(packagePath);
    const dir = path.dirname(packagePath);
    const pkg = JSON.parse(fs.readFileSync(packagePath));
    assert.equal(pkg.name, 'braces'); assert.equal(pkg.version, node.version);
    const runtimeFiles = manifest.files.map(item => {
      const file = fs.realpathSync(path.join(dir, item.path));
      assert.ok(file.startsWith(dir + path.sep), 'runtime source must be inside installed package');
      const sha256 = hash(fs.readFileSync(file));
      assert.equal(sha256, item.patchedSha256, 'installed runtime source: ' + item.path);
      return {path: item.path, sha256};
    });
    const scoped = createRequire(packagePath);
    const braces = scoped('./');
    assert.deepEqual(braces('src/**/*.{js,ts,tsx}'), ['src/**/*.(js|ts|tsx)']);
    assert.deepEqual(braces.expand('a/{b,c}/d'), ['a/b/d', 'a/c/d']);
    assert.deepEqual(braces.expand('file-{1..3}.txt'), ['file-1.txt', 'file-2.txt', 'file-3.txt']);
    assert.deepEqual(braces.expand('{a,{b,c}}'), ['a', 'b', 'c']);
    assert.equal(braces.stringify('a/{b,c}/d'), 'a/{b,c}/d');
    for (const [open, close] of [['{','}'], ['(',')']]) {
      for (const method of ['parse', 'compile', 'expand', 'stringify']) {
        assert.doesNotThrow(() => braces[method](open.repeat(128) + 'x' + close.repeat(128)));
        for (const depth of [129, 4000]) {
          assert.throws(() => braces[method](open.repeat(depth) + 'x' + close.repeat(depth)), {name: 'SyntaxError', message: /maximum depth \(128\)/});
        }
        assert.throws(() => braces[method](open.repeat(129) + 'x' + close.repeat(129), {maxDepth: 10000, maxLength: 10000}), {name: 'SyntaxError', message: /maximum depth \(128\)/});
      }
    }
    for (const method of ['compile', 'expand', 'stringify']) {
      const ast = {type: 'root', nodes: []}; let item = ast;
      for (let depth = 0; depth < 4000; depth++) { const child = {type: 'paren', parent: item, nodes: []}; item.nodes.push(child); item = child; }
      item.nodes.push({type: 'text', value: 'x'});
      assert.throws(() => braces[method](ast), {name: 'SyntaxError', message: /maximum depth \(128\)/});
    }
    bindings.push({packagePath: node.packagePath, version: pkg.version, sourcePaths: node.sourcePaths, runtimeFiles, behaviorVerified: true});
  }
  const consumers = [];
  for (const node of graph.nodes.filter(node => node.name === 'micromatch' || node.name === 'fast-glob')) {
    const packagePath = path.resolve(root, node.packagePath);
    const scoped = createRequire(packagePath);
    const micromatch = node.name === 'micromatch' ? scoped('./') : scoped('micromatch');
    const micromatchPackage = node.name === 'micromatch' ? packagePath : scoped.resolve('micromatch/package.json');
    const bracesPackage = fs.realpathSync(createRequire(micromatchPackage).resolve('braces/package.json'));
    assert.ok(verified.has(bracesPackage), 'consumer must use a verified patched braces installation');
    assert.deepEqual(micromatch(['a.js', 'b.ts', 'c.txt'], '*.{js,ts}'), ['a.js', 'b.ts']);
    if (node.name === 'fast-glob') {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'urai-factory-glob-'));
      try {
        for (const file of ['a.js', 'b.ts', 'c.txt']) fs.writeFileSync(path.join(dir, file), 'fixture');
        assert.deepEqual(scoped('./').sync('*.{js,ts}', {cwd: dir, onlyFiles: true}).sort(), ['a.js', 'b.ts']);
      } finally { fs.rmSync(dir, {recursive: true, force: true}); }
    }
    consumers.push({name: node.name, version: node.version, packagePath: node.packagePath, bracesPackage: path.relative(root, bracesPackage), behaviorVerified: true});
  }
  assert.ok(consumers.some(item => item.name === 'micromatch'), 'actual micromatch consumer required');
  assert.ok(consumers.some(item => item.name === 'fast-glob'), 'actual filesystem-glob consumer required');
  return {schemaVersion: 'urai-factory-braces-installed-mitigation-v1', advisoryId: manifest.advisoryId, upstreamVersion: manifest.upstreamVersion, patchSha256: manifest.patchSha256, pnpmLockSha256: hash(lock), actualConsumerBindings: bindings, consumers, installedBehaviorVerified: true, rawHighFindingRetained: true, upstreamFixed: false, securityGateWaived: false, productionAcceptance: false};
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const sourceSha = process.env.ASSET_FACTORY_EXACT_HEAD;
  assert.match(sourceSha ?? '', /^[a-f0-9]{40}$/);
  assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim(), sourceSha);
  assert.match(process.env.GITHUB_RUN_ID ?? '', /^\d+$/);
  const importers = ['.', ...fs.readFileSync(path.join(root, 'pnpm-workspace.yaml'), 'utf8').split('\n').filter(line => /^  - /.test(line)).map(line => line.slice(4).trim())];
  const result = {...verifyFactoryBraces(root, installedGraph(root, importers)), sourceSha, workflowRunId: process.env.GITHUB_RUN_ID};
  const output = path.join(root, 'artifacts/factory-braces-installed-mitigation.json');
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
}
