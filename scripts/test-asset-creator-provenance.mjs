import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import path, { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import vm from 'node:vm';
import test from 'node:test';

const server = fileURLToPath(new URL('../assetfactory-studio/lib/server/', import.meta.url));
async function fixture() {
  const records = new Map();
  const localFiles = new Map();
  const ref = path => ({ path });
  const snapshot = target => ({ exists: records.has(target.path), data: () => structuredClone(records.get(target.path)), get: key => records.get(target.path)?.[key] });
  const db = { collection: name => ({ doc: id => ref(`${name}/${id}`) }),
    runTransaction: async run => {
      const writes = [];
      const result = await run({ get: async target => snapshot(target),
        create: (target, data) => { if (records.has(target.path)) throw new Error('Already exists'); writes.push([target.path, data]); },
        set: (target, data, options) => writes.push([target.path, options?.merge ? { ...records.get(target.path), ...data } : data]),
      });
      for (const [path, data] of writes) records.set(path, structuredClone(data));
      return result;
    } };
  const context = vm.createContext({ Buffer, Date, console, setTimeout, clearTimeout, process: { env: {}, cwd: () => '/synthetic-local' } });
  const modules = new Map();
  async function load(name) {
    if (modules.has(name)) return modules.get(name);
    const module = new vm.SourceTextModule(stripTypeScriptTypes(readFileSync(resolve(server, `${name}.ts`), 'utf8'), { mode: 'transform' }), { context });
    modules.set(name, module);
    await module.link(async key => {
      if (key === './assetCreatorProvenance') return load('assetCreatorProvenance');
      const imports = { './firebaseAdmin': { getAdminDb: () => db, getAdminBucket: () => { throw Error('No Storage'); } },
        'node:path': { default: path }, 'node:fs/promises': { default: {
          readFile: async key => { if (!localFiles.has(key)) throw Error('missing'); return localFiles.get(key); },
          writeFile: async (key, value) => { localFiles.set(key, value); }, mkdir: async () => {},
        } },
        'node:crypto': { createHash }, 'node:perf_hooks': { performance } }[key];
      assert.ok(imports, `Unexpected ${key}`);
      return new vm.SyntheticModule(Object.keys(imports), function () { for (const [key, value] of Object.entries(imports)) this.setExport(key, value); }, { context });
    });
    return module;
  }
  const cloud = await load('cloudAssetFactoryStore'); await cloud.evaluate();
  const local = await load('localAssetFactoryStore'); await local.evaluate();
  return { cloud: cloud.namespace, local: local.namespace, helper: modules.get('assetCreatorProvenance').namespace, records };
}
const auth = { ok: true, mode: 'jwt', userId: 'verified-user', tenantId: 'shared-tenant' };
const rawJob = { jobId: 'synthetic-job', tenantId: 'shared-tenant', type: 'graphic' };

test('new verified creator propagates through persisted job, queue and derived asset', async () => {
  const f = await fixture();
  const job = f.helper.bindCreatorProvenance(rawJob, auth);
  await f.cloud.cloudAddJob(job);
  await f.cloud.cloudUpdateJob(job.jobId, { status: 'materialized' });
  const asset = await f.cloud.cloudUpsertAsset({ ...rawJob, creatorProvenance: { creatorUserId: 'forged' }, ownerId: 'forged' });
  for (const path of ['assetFactoryJobs', 'assetFactoryQueue', 'assetFactoryAssets'])
    assert.deepEqual(f.records.get(`${path}/${job.jobId}`).creatorProvenance, structuredClone(job.creatorProvenance));
  assert.equal(asset.creatorProvenance.creatorUserId, auth.userId);
  assert.equal(asset.creatorProvenance.consumerDeletionEligible, false);
  assert.equal(Object.hasOwn(asset, 'ownerId'), false);
});

for (const [field, value] of [['creatorProvenance', { creatorUserId: 'other' }], ['tenantId', 'other'], ['jobId', 'other'], ['ownerId', 'other'], ['userId', 'other'], ['subjectIds', ['other']]])
test(`job update rejects immutable ${field}`, async () => {
  const f = await fixture(); const job = f.helper.bindCreatorProvenance(rawJob, auth);
  await f.cloud.cloudAddJob(job); const before = structuredClone([...f.records]);
  await assert.rejects(f.cloud.cloudUpdateJob(job.jobId, { [field]: value }), /immutable/);
  assert.deepEqual([...f.records], before);
});

test('duplicate job create cannot replace attribution or leave a new queue', async () => {
  const f = await fixture(); await f.cloud.cloudAddJob(f.helper.bindCreatorProvenance(rawJob, auth));
  const before = structuredClone([...f.records]);
  await assert.rejects(f.cloud.cloudAddJob(f.helper.bindCreatorProvenance(rawJob, { ...auth, userId: 'other' })));
  assert.deepEqual([...f.records], before);
});

test('legacy job remains unattributed through update and asset derivation', async () => {
  const f = await fixture(); await f.cloud.cloudAddJob(rawJob);
  await f.cloud.cloudUpdateJob(rawJob.jobId, { status: 'materialized' });
  const asset = await f.cloud.cloudUpsertAsset({ ...rawJob, creatorProvenance: { creatorUserId: 'guessed' } });
  assert.equal(Object.hasOwn(asset, 'creatorProvenance'), false);
  await assert.rejects(f.cloud.cloudUpdateJob(rawJob.jobId, { creatorProvenance: f.helper.bindCreatorProvenance(rawJob, auth).creatorProvenance }));
});

test('unverified and legacy-header identities stay unknown', async () => {
  const f = await fixture();
  for (const mode of ['disabled', 'legacy-headers']) {
    const row = f.helper.bindCreatorProvenance({ ...rawJob, ownerId: 'forged' }, { ...auth, mode });
    assert.equal(row.creatorProvenance.state, 'unknown');
    assert.equal(Object.hasOwn(row.creatorProvenance, 'creatorUserId'), false);
  }
});

test('derived assets require same tenant and actual parent job', async () => {
  const f = await fixture();
  await assert.rejects(f.cloud.cloudUpsertAsset(rawJob), /parent/);
  await f.cloud.cloudAddJob(f.helper.bindCreatorProvenance(rawJob, auth));
  await assert.rejects(f.cloud.cloudUpsertAsset({ ...rawJob, tenantId: 'other' }), /identity/);
});

test('local development backend preserves attribution without upgrading legacy records', async () => {
  const f = await fixture(); const job = f.helper.bindCreatorProvenance(rawJob, auth);
  await f.local.localAddJob(job);
  await assert.rejects(f.local.localAddJob({ ...job, creatorProvenance: {} }));
  await assert.rejects(f.local.localUpdateJob(job.jobId, { creatorProvenance: {} }));
  await f.local.localUpdateJob(job.jobId, { status: 'materialized' });
  const asset = await f.local.localUpsertAsset({ ...rawJob, creatorProvenance: {} });
  assert.equal(asset.creatorProvenance.creatorUserId, auth.userId);
  const legacy = { ...rawJob, jobId: 'legacy' };
  await f.local.localAddJob(legacy);
  assert.equal(Object.hasOwn(await f.local.localUpsertAsset(legacy), 'creatorProvenance'), false);
});
