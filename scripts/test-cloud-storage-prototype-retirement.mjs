import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = resolve(process.env.URAI_STORAGE_TEST_ROOT || process.cwd());

for (const path of ['functions/index.js', 'functions/processAssetJob.js']) {
  test(`preserved ${path} cannot initialize SDKs or publish simulated cloud output`, () => {
    const source = readFileSync(resolve(root, path), 'utf8');
    let dependencies = 0;
    const context = vm.createContext({
      process: { env: { NODE_ENV: 'production', GCLOUD_PROJECT: 'synthetic-asset-factory' } },
      exports: {},
      require() { dependencies++; throw new Error('Synthetic boundary denies any SDK initialization'); },
    });
    assert.throws(() => new vm.Script(source, { filename: path }).runInContext(context), /Superseded Asset Factory simulator/);
    assert.equal(dependencies, 0);
  });
}

test('preserved unbound cloud worker cannot initialize Storage or watch cloud jobs', async () => {
  const source = readFileSync(resolve(root, 'engine/worker.js'), 'utf8');
  let dispatches = 0;
  const deny = () => { dispatches++; throw new Error('Synthetic boundary denies all cloud dispatch'); };
  const context = vm.createContext({ Buffer, __dirname: '/synthetic', process: { env: { NODE_ENV: 'production' } } });
  const dependencies = {
    '../assetfactory-studio/lib/firebase': { db: { collection: deny } },
    '../assetfactory-studio/lib/hashing': { hashFile: deny, combineHashes: deny },
    '../assetfactory-studio/lib/logger': { logger: { info: deny, warn: deny, error: deny } },
    'fs-extra': { default: {} },
    path: { default: { join: () => '/synthetic/outputs' } },
    crypto: { default: { randomBytes: () => Buffer.alloc(8) } },
    '@google-cloud/storage': { Storage: class { constructor() { deny(); } } },
    './config.json': { default: { narrativeModel: { version: 'synthetic' } } },
  };
  const module = new vm.SourceTextModule(source, { context });
  await module.link(specifier => {
    const exports = dependencies[specifier];
    assert.ok(exports, `Missing explicit synthetic dependency ${specifier}`);
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
  });
  await assert.rejects(module.evaluate(), /Superseded Asset Factory cloud worker/);
  assert.equal(dispatches, 0);
});
