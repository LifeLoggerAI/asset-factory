#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const source = path.join(root, 'scripts/run-dedicated-firebase-deploy.mjs');
const project = 'synthetic-asset-factory-prod';
const site = 'synthetic-asset-factory-site';

function fixture(sourceConfig, options = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'urai-dedicated-config-test-'));
  const deployRoot = path.join(dir, 'checkout', options.studio ? 'assetfactory-studio' : '');
  const scriptDir = path.join(dir, 'checkout', 'scripts');
  const bin = path.join(dir, 'bin');
  const observation = path.join(dir, 'invocation.json');
  mkdirSync(deployRoot, { recursive: true });
  mkdirSync(scriptDir, { recursive: true });
  mkdirSync(bin);
  copyFileSync(source, path.join(scriptDir, 'run-dedicated-firebase-deploy.mjs'));
  writeFileSync(path.join(deployRoot, 'firebase.json'), JSON.stringify(sourceConfig));
  writeFileSync(path.join(bin, 'firebase'), `#!/usr/bin/env node
const fs=require('node:fs');
const args=process.argv.slice(2);
const configPath=args[args.indexOf('--config')+1];
const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
fs.writeFileSync(process.env.URAI_SYNTHETIC_INVOCATION,JSON.stringify({args,configPath,config,cwd:process.cwd()}));
process.exit(Number(process.env.URAI_SYNTHETIC_EXIT||0));
`);
  chmodSync(path.join(bin, 'firebase'), 0o755);
  const result = spawnSync(process.execPath, [path.join(scriptDir, 'run-dedicated-firebase-deploy.mjs'), ...(options.studio ? ['--cwd', 'assetfactory-studio'] : []), '--only', options.only ?? 'hosting,functions,firestore,storage'], {
    cwd: path.join(dir, 'checkout'),
    env: {
      ...process.env,
      PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      ASSET_FACTORY_FIREBASE_PROJECT_ID: options.project ?? project,
      ASSET_FACTORY_FIREBASE_HOSTING_SITE: site,
      ASSET_FACTORY_BASE_URL: 'https://synthetic-asset-factory.example.invalid',
      URAI_SYNTHETIC_INVOCATION: observation,
      URAI_SYNTHETIC_EXIT: String(options.exit ?? 0),
    },
    encoding: 'utf8',
  });
  return {
    result, deployRoot,
    observed: existsSync(observation) ? JSON.parse(readFileSync(observation, 'utf8')) : null,
    close() { rmSync(dir, { recursive: true, force: true }); },
  };
}

const rootConfig = JSON.parse(readFileSync(path.join(root, 'firebase.json'), 'utf8'));
const studioConfig = JSON.parse(readFileSync(path.join(root, 'assetfactory-studio/firebase.json'), 'utf8'));

test('actual root wrapper materializes only the explicit site and preserves reviewed input paths outside the checkout', () => {
  const f = fixture(rootConfig);
  try {
    assert.equal(f.result.status, 0, f.result.stderr);
    assert.ok(f.observed);
    const { args, config, configPath } = f.observed;
    assert.equal(args[args.indexOf('--project') + 1], project);
    assert.equal(config.hosting.site, site);
    assert.equal(config.hosting.target, undefined);
    assert.equal(config.hosting.public, path.join(f.deployRoot, 'public'));
    assert.equal(config.functions.source, path.join(f.deployRoot, 'life-map-pipeline/functions'));
    assert.equal(config.firestore.rules, path.join(f.deployRoot, 'firestore.rules'));
    assert.equal(config.storage.rules, path.join(f.deployRoot, 'storage.rules'));
    assert.deepEqual(config.hosting.rewrites, rootConfig.hosting.rewrites);
    assert.deepEqual(config.functions.predeploy, rootConfig.functions.predeploy);
    assert.equal(existsSync(configPath), false, 'temporary config must be removed after success');
  } finally { f.close(); }
});

test('actual Studio wrapper binds the framework source to its selected deployment cwd', () => {
  const f = fixture(studioConfig, { studio: true });
  try {
    assert.equal(f.result.status, 0, f.result.stderr);
    assert.equal(f.observed.config.hosting.site, site);
    assert.equal(f.observed.config.hosting.target, undefined);
    assert.equal(f.observed.config.hosting.source, f.deployRoot);
    assert.deepEqual(f.observed.config.apphosting, studioConfig.apphosting);
    assert.equal(existsSync(f.observed.configPath), false);
  } finally { f.close(); }
});

for (const target of [undefined, 'consumer-default']) {
  test(`missing or alternate symbolic target denies CLI invocation (${String(target)})`, () => {
    const config = structuredClone(rootConfig);
    if (target === undefined) delete config.hosting.target;
    else config.hosting.target = target;
    const f = fixture(config);
    try {
      assert.notEqual(f.result.status, 0);
      assert.match(f.result.stderr, /unbound asset-factory-production target/);
      assert.equal(f.observed, null, 'no CLI may execute for an unapproved configuration');
    } finally { f.close(); }
  });
}

test('consumer project is denied before the synthetic CLI can execute', () => {
  const f = fixture(rootConfig, { project: 'urai-4dc1d' });
  try {
    assert.notEqual(f.result.status, 0);
    assert.match(f.result.stderr, /legacy\/shared Firebase project/);
    assert.equal(f.observed, null);
  } finally { f.close(); }
});

test('CLI failure is preserved and temporary config is removed', () => {
  const f = fixture(rootConfig, { exit: 17 });
  try {
    assert.equal(f.result.status, 17);
    assert.ok(f.observed);
    assert.equal(existsSync(f.observed.configPath), false);
  } finally { f.close(); }
});

test('multi-codebase Functions and rules paths retain deployment cwd identity', () => {
  const config = structuredClone(rootConfig);
  config.functions = [{ source: 'functions-a', codebase: 'a' }, { source: 'functions-b', codebase: 'b' }];
  config.firestore = [{ database: 'a', rules: 'rules/a.rules', indexes: 'rules/a.indexes.json' }];
  config.storage = [{ target: 'objects', rules: 'rules/storage.rules' }];
  const f = fixture(config);
  try {
    assert.equal(f.result.status, 0, f.result.stderr);
    assert.deepEqual(f.observed.config.functions.map((entry) => entry.source), [path.join(f.deployRoot, 'functions-a'), path.join(f.deployRoot, 'functions-b')]);
    assert.equal(f.observed.config.firestore[0].rules, path.join(f.deployRoot, 'rules/a.rules'));
    assert.equal(f.observed.config.firestore[0].indexes, path.join(f.deployRoot, 'rules/a.indexes.json'));
    assert.equal(f.observed.config.storage[0].rules, path.join(f.deployRoot, 'rules/storage.rules'));
    assert.equal(f.observed.config.storage[0].target, 'objects');
  } finally { f.close(); }
});

test('whitespace around bounded target entries retains explicit Hosting site materialization', () => {
  const f = fixture(rootConfig, { only: ' hosting , functions ' });
  try {
    assert.equal(f.result.status, 0, f.result.stderr);
    assert.equal(f.observed.config.hosting.site, site);
    assert.equal(f.observed.config.hosting.target, undefined);
    assert.equal(f.observed.args[f.observed.args.indexOf('--only') + 1], 'hosting,functions');
  } finally { f.close(); }
});

test('whitespace around Hosting cannot skip the mandatory symbolic source target gate', () => {
  const config = structuredClone(rootConfig);
  delete config.hosting.target;
  const f = fixture(config, { only: ' hosting , functions ' });
  try {
    assert.notEqual(f.result.status, 0);
    assert.match(f.result.stderr, /unbound asset-factory-production target/);
    assert.equal(f.observed, null, 'no CLI may execute before the source Hosting target gate');
  } finally { f.close(); }
});

for (const only of [',', 'hosting,']) {
  test(`an empty target entry denies CLI invocation (${only})`, () => {
    const f = fixture(rootConfig, { only });
    try {
      assert.notEqual(f.result.status, 0);
      assert.match(f.result.stderr, /nonempty bounded target list/);
      assert.equal(f.observed, null, 'no CLI may interpret an empty deployment target');
    } finally { f.close(); }
  });
}
