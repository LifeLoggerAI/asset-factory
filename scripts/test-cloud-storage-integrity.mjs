import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { performance } from 'node:perf_hooks';
import test from 'node:test';
import vm from 'node:vm';

const root = resolve(process.env.URAI_STORAGE_TEST_ROOT || process.cwd());
const server = resolve(root, 'assetfactory-studio/lib/server');
const path = 'tenants/synthetic/jobs/job/v1/artifact.glb';
const mime = 'model/gltf-binary';
const bytes = Buffer.from('synthetic verified artifact');
const digest = value => createHash('sha256').update(value).digest('hex');
const coded = code => Object.assign(new Error(`SYNTHETIC-${code}`), { code });

// Independent CRC32C fixture, not a provider response or cloud acceptance proof.
function crc32c(value) {
  let crc = 0xffffffff;
  for (const byte of value) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0x82f63b78 : 0);
  }
  const result = Buffer.alloc(4); result.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return result.toString('base64');
}
function generator() {
  let value = Buffer.alloc(0);
  return { update(next) { value = Buffer.concat([value, next]); }, toString() { return crc32c(value); } };
}

async function withLiveSyntheticTransport(run) {
  // The mocked Readable has no socket handle. Model that live request lifetime
  // while preserving the actual source timer's unref and cancellation behavior.
  const transport = setInterval(() => {}, 1000);
  try { return await run(); }
  finally { clearInterval(transport); }
}

async function actualModule(name, mocks, context = vm.createContext({ Buffer, console, setTimeout, clearTimeout, process: { env: {} } })) {
  const source = stripTypeScriptTypes(readFileSync(resolve(server, `${name}.ts`), 'utf8'), { mode: 'transform' });
  const module = new vm.SourceTextModule(source, { context });
  await module.link(async specifier => {
    const exports = mocks[specifier] ?? (specifier === 'node:perf_hooks' ? { performance } : undefined);
    assert.ok(exports, `Missing synthetic import ${specifier}`);
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
  });
  await module.evaluate(); return module.namespace;
}

async function storageFixture(hooks = {}) {
  let nextGeneration = 100; const objects = new Map(), history = new Map();
  const calls = { save: [], download: [], metadata: [], exists: 0, deletes: 0, commits: 0 };
  const seed = (data = bytes, metadata = {}) => {
    const generation = String(nextGeneration++);
    const entry = { buffer: Buffer.from(data), metadata: { generation, size: String(data.length), crc32c: crc32c(data), contentType: mime, ...metadata } };
    objects.set(path, entry); history.set(generation, entry); return entry;
  };
  const bucket = { name: 'synthetic-asset-factory.firebasestorage.app', file(objectPath, options = {}) {
    return {
      crc32cGenerator: hooks.generator || generator,
      async save(data, input) {
        calls.save.push({ objectPath, options: structuredClone(input), buffer: Buffer.from(data) });
        await hooks.beforeSave?.(data, input);
        if (hooks.saveError && !hooks.commitBeforeError) throw coded(hooks.saveError);
        if (input.preconditionOpts?.ifGenerationMatch === 0 && objects.has(objectPath)) throw coded(412);
        if (input.metadata.crc32c && input.metadata.crc32c !== crc32c(data)) throw coded(400);
        const generation = String(nextGeneration++);
        const entry = { buffer: Buffer.from(data), metadata: { generation, size: String(data.length), crc32c: crc32c(data), contentType: input.contentType, ...structuredClone(input.metadata) } };
        objects.set(objectPath, entry); history.set(generation, entry); calls.commits++;
        if (hooks.saveError) throw coded(hooks.saveError);
      },
      createWriteStream(input) {
        const file = this, chunks = [];
        return new Writable({
          write(chunk, encoding, callback) { chunks.push(Buffer.from(chunk)); callback(); },
          final(callback) { file.save(Buffer.concat(chunks), input).then(() => callback(), callback); },
        });
      },
      async getMetadata() {
        calls.metadata.push({ objectPath, options });
        const entry = options.generation ? history.get(String(options.generation)) : objects.get(objectPath);
        if (!entry) throw coded(404);
        const metadata = structuredClone(entry.metadata);
        await hooks.afterMetadata?.(metadata, entry, { seed, objects, history }); return [metadata];
      },
      requestStream(input) {
        const call = { objectPath, options, input, destroyed: false }; calls.metadata.push(call);
        const stream = new Readable({ read() {
          if (hooks.stalledMetadata) return;
          (async () => {
            const entry = options.generation ? history.get(String(options.generation)) : objects.get(objectPath);
            const statusCode = hooks.metadataStatus ?? (entry ? 200 : 404);
            const metadata = entry ? structuredClone(entry.metadata) : {};
            await hooks.afterMetadata?.(metadata, entry, { seed, objects, history });
            if (!hooks.missingMetadataResponse) this.emit('response', { statusCode });
            if (this.destroyed) return;
            this.push(Buffer.from(hooks.metadataPayload ?? JSON.stringify(metadata))); this.push(null);
          })().catch(error => this.destroy(error));
        } });
        stream.on('close', () => { call.destroyed = true; }); return stream;
      },
      async exists() { calls.exists++; return [objects.has(objectPath)]; },
      async download(input) {
        calls.download.push({ objectPath, options, input });
        const entry = options.generation ? history.get(String(options.generation)) : objects.get(objectPath);
        if (!entry) throw coded(404);
        return [Buffer.from(hooks.downloadBytes || entry.buffer)];
      },
      createReadStream(input) {
        calls.download.push({ objectPath, options, input });
        const entry = options.generation ? history.get(String(options.generation)) : objects.get(objectPath);
        if (!entry) { const stream = new Readable({ read() { this.destroy(coded(404)); } }); return stream; }
        if (hooks.stalledRead) return new Readable({ read() {} });
        return Readable.from([Buffer.from(hooks.downloadBytes || entry.buffer)]);
      },
      async delete() { calls.deletes++; objects.delete(objectPath); },
    };
  } };
  class SyntheticStorage {
    constructor(options) { Object.assign(this, options); }
    bucket(name) { assert.equal(name, bucket.name); return { ...bucket, storage: this }; }
  }
  bucket.storage = new SyntheticStorage({
    projectId: 'synthetic-asset-factory', apiEndpoint: 'https://storage.googleapis.com',
    authClient: { async authorizeRequest(request) { return request; } },
  });
  const context = vm.createContext({ Buffer, console, process: { env: {} }, clearTimeout,
    setTimeout(callback, delay) { if (hooks.stalledRead || hooks.stalledMetadata) { assert.equal(delay, 60000); return setTimeout(callback, 2); } return setTimeout(callback, delay); },
  });
  const module = await actualModule('cloudAssetFactoryStore', {
    './firebaseAdmin': { getAdminBucket: () => bucket, getAdminDb: () => null },
    'node:crypto': { createHash },
  }, context);
  return { module, calls, objects, history, seed };
}

async function adminFixture(env = {}, existingApps = [], sdkChanges = {}) {
  const apps = structuredClone(existingApps); const calls = { credentials: 0, initialize: [], bucket: [], db: [] };
  const credential = { synthetic: true };
  const adcFiles = sdkChanges.adcFiles ?? {};
  const sdk = {
    applicationDefault() { calls.credentials++; return credential; },
    cert() { throw new Error('Synthetic fixture never accepts private key credentials'); },
    getApps: () => apps,
    initializeApp(options, name = '[DEFAULT]') { const app = { name, options }; calls.initialize.push(app); apps.push(app); return app; },
    getFirestore(app) { calls.db.push(app); return { projectId: app.options.projectId }; },
    getStorage(app) { return { bucket(name) { calls.bucket.push({ app, name }); return { name: name || app.options.storageBucket }; } }; },
    ...sdkChanges,
  };
  const context = vm.createContext({ Buffer, console, process: { env } });
  const module = await actualModule('firebaseAdmin', {
    'firebase-admin/app': { applicationDefault: sdk.applicationDefault, cert: sdk.cert, getApps: sdk.getApps, initializeApp: sdk.initializeApp },
    'firebase-admin/firestore': { getFirestore: sdk.getFirestore },
    'firebase-admin/storage': { getStorage: sdk.getStorage },
    'node:fs': {
      existsSync: path => path in adcFiles,
      openSync(path) { if (!(path in adcFiles)) throw new Error('SYNTHETIC-ADC-FILE-NOT-FOUND'); return path; },
      fstatSync(path) { return { isFile: () => true, size: Buffer.byteLength(adcFiles[path]) }; },
      readSync(path, buffer) { return Buffer.from(adcFiles[path]).copy(buffer); },
      closeSync() {},
    },
    'node:path': { join },
  }, context);
  return { module, calls, apps, env };
}
const target = () => ({ FIREBASE_PROJECT_ID: 'synthetic-asset-factory', FIREBASE_STORAGE_BUCKET: 'synthetic-asset-factory.firebasestorage.app' });

test('independent CRC32C fixture matches known empty and 123456789 vectors', () => {
  assert.equal(crc32c(Buffer.alloc(0)), 'AAAAAA=='); assert.equal(crc32c(Buffer.from('123456789')), '4waSgw==');
});
test('actual writer sends explicit server CRC32C, client validation, create precondition and private metadata', async () => {
  const f = await storageFixture();
  assert.match(await f.module.cloudWriteGenerated('artifact.glb', bytes, mime, path), /^gs:\/\/synthetic-/);
  const call = f.calls.save[0]; assert.equal(call.options.metadata.crc32c, crc32c(bytes));
  assert.equal(call.options.metadata.metadata.sha256, digest(bytes)); assert.equal(call.options.validation, 'crc32c');
  assert.equal(call.options.preconditionOpts.ifGenerationMatch, 0); assert.equal(call.options.resumable, false);
  assert.ok(Number.isInteger(call.options.timeout) && call.options.timeout > 0 && call.options.timeout <= 60000);
  assert.equal(call.options.metadata.cacheControl, 'private, max-age=60');
  // Instance-level fencing also covers the SDK's own checksum-mismatch delete.
  assert.equal(f.calls.metadata[0].options.preconditionOpts, undefined);
});
test('different bytes cannot overwrite the same immutable artifact version', async () => {
  const f = await storageFixture(); await f.module.cloudWriteGenerated('artifact.glb', bytes, mime, path);
  await assert.rejects(f.module.cloudWriteGenerated('artifact.glb', Buffer.from('conflicting bytes'), mime, path), /conflicts/);
  assert.equal(f.calls.commits, 1); assert.deepEqual(f.objects.get(path).buffer, bytes); assert.equal(f.calls.deletes, 0);
});
test('two same-byte clients race to one committed object and converge to one URI', async () => {
  const f = await storageFixture(); const values = await Promise.all(Array.from({ length: 12 }, () => f.module.cloudWriteGenerated('artifact.glb', bytes, mime, path)));
  assert.equal(new Set(values).size, 1); assert.equal(f.calls.commits, 1); assert.equal(f.calls.deletes, 0);
  assert.ok(f.calls.download.every(call => call.options.generation));
});
test('two different-byte clients race without replacing the winning version', async () => {
  const f = await storageFixture(); const values = await Promise.allSettled([f.module.cloudWriteGenerated('artifact.glb', bytes, mime, path), f.module.cloudWriteGenerated('artifact.glb', Buffer.from('different'), mime, path)]);
  assert.equal(values.filter(x => x.status === 'fulfilled').length, 1); assert.equal(f.calls.commits, 1); assert.deepEqual(f.objects.get(path).buffer, bytes);
});
test('same-byte legacy object is reused only after generation-pinned SHA256 readback', async () => {
  const f = await storageFixture(); const prior = f.seed(); await f.module.cloudWriteGenerated('artifact.glb', bytes, mime, path);
  assert.equal(f.calls.commits, 0); assert.equal(f.calls.download[0].options.generation, prior.metadata.generation); assert.equal(f.calls.deletes, 0);
});
test('forged metadata SHA256 never admits a different legacy payload', async () => {
  const different = Buffer.from(bytes); different[0] ^= 1;
  const f = await storageFixture(); f.seed(different, { crc32c: crc32c(bytes), size: String(bytes.length), metadata: { sha256: digest(bytes) } });
  await assert.rejects(f.module.cloudWriteGenerated('artifact.glb', bytes, mime, path), /bytes failed/); assert.equal(f.calls.deletes, 0);
});

async function sdkFixture({ corruptResponse = false } = {}) {
  const require = createRequire(import.meta.url);
  const adminPath = require.resolve('firebase-admin/storage', { paths: [resolve(root, 'assetfactory-studio')] });
  const sdkRequire = createRequire(adminPath);
  const sdkEntry = sdkRequire.resolve('@google-cloud/storage');
  const sdkPackage = JSON.parse(readFileSync(resolve(dirname(sdkEntry), '../../../package.json'), 'utf8'));
  assert.equal(sdkPackage.version, '7.21.0', 'exercise the exact Storage SDK pinned in current Factory lock');
  const { Storage } = sdkRequire('@google-cloud/storage');
  const sdk = new Storage({ projectId: 'synthetic-asset-factory', retryOptions: { autoRetry: false } });
  let authAttempts = 0;
  const authDenied = () => { authAttempts++; throw new Error('Synthetic SDK fixture denies real authentication'); };
  sdk.authClient.getClient = authDenied;
  sdk.makeAuthenticatedRequest = authDenied;
  const requests = [], scopedConfigurations = []; let object = null, replacementsDeleted = 0;
  function fixtureBucket(owner, name) {
  const bucket = Storage.prototype.bucket.call(owner, name);
  const originalFile = bucket.file.bind(bucket);
  bucket.requestStream = input => {
    requests.push({ metadata: true, method: input.method, uri: input.uri, timeout: input.timeout, maxRetries: input.maxRetries, json: input.json });
    return new Readable({ read() {
      this.emit('response', { statusCode: object ? 200 : 404 });
      if (!this.destroyed) { this.push(Buffer.from(JSON.stringify(object?.metadata ?? {}))); this.push(null); }
    } });
  };
  bucket.file = (name, options = {}) => {
    const file = originalFile(name, options);
    file.request = (input, callback) => {
      const capture = { method: input.method, qs: structuredClone(input.qs), timeout: input.timeout };
      requests.push(capture);
      (async () => {
        if (input.multipart) {
          const metadata = JSON.parse(input.multipart[0].body); const chunks = [];
          for await (const chunk of input.multipart[1].body) chunks.push(chunk);
          const body = Buffer.concat(chunks); capture.metadata = metadata; capture.sha256 = digest(body);
          if (input.qs.ifGenerationMatch === 0 && object) return callback(coded(412));
          if (metadata.crc32c && metadata.crc32c !== crc32c(body)) return callback(coded(400));
          object = { buffer: body, metadata: { ...metadata, generation: '100', size: String(body.length), crc32c: crc32c(body) } };
          const response = structuredClone(object.metadata);
          if (corruptResponse) {
            // Simulate response corruption plus an independent later generation.
            response.crc32c = 'AAAAAA=='; object = { buffer: Buffer.from('synthetic later protected generation'), metadata: { generation: '101' } };
          }
          return callback(null, response, {});
        }
        if (input.method === 'DELETE') {
          if (input.qs?.ifGenerationMatch === 0) return callback(coded(412));
          object = null; replacementsDeleted++; return callback(null, {}, {});
        }
        throw new Error('Synthetic SDK fixture denies all unimplemented requests');
      })().catch(error => callback(error));
    };
    // ServiceObject's internal delete dispatch delegates to the parent request;
    // fence that boundary too, rather than only replacing public File.request.
    bucket.request = file.request;
    owner.request = file.request;
    file.getMetadata = async () => { if (!object) throw coded(404); return [structuredClone(object.metadata)]; };
    return file;
  };
  return bucket;
  }
  class ScopedFixtureStorage extends Storage {
    constructor(options) {
      super(options); this.bucket = name => fixtureBucket(this, name);
      scopedConfigurations.push({ sdk: this, expectedCredential: options.authClient });
    }
  }
  sdk.constructor = ScopedFixtureStorage;
  const bucket = fixtureBucket(sdk, 'synthetic-asset-factory.appspot.com');
  const module = await actualModule('cloudAssetFactoryStore', { './firebaseAdmin': { getAdminBucket: () => bucket, getAdminDb: () => null }, 'node:crypto': { createHash } });
  return { module, requests, scopedConfigurations, object: () => object, replacementsDeleted: () => replacementsDeleted, authAttempts: () => authAttempts, sdkPackage };
}
test('actual locked SDK recognizes its direct emulator endpoint alias without authentication/network', () => {
  const previous = process.env.STORAGE_EMULATOR_HOST;
  try {
    process.env.STORAGE_EMULATOR_HOST = 'http://127.0.0.1:9199';
    const require = createRequire(import.meta.url);
    const adminPath = require.resolve('firebase-admin/storage', { paths: [resolve(root, 'assetfactory-studio')] });
    const sdkRequire = createRequire(adminPath);
    const { Storage } = sdkRequire('@google-cloud/storage');
    const sdk = new Storage({ projectId: 'synthetic-asset-factory', retryOptions: { autoRetry: false } });
    let authAttempts = 0;
    const authDenied = () => { authAttempts++; throw new Error('Synthetic endpoint fixture denies real authentication'); };
    sdk.authClient.getClient = authDenied; sdk.makeAuthenticatedRequest = authDenied;
    assert.equal(sdk.apiEndpoint, 'http://127.0.0.1:9199');
    assert.equal(authAttempts, 0);
  } finally {
    if (previous === undefined) delete process.env.STORAGE_EMULATOR_HOST;
    else process.env.STORAGE_EMULATOR_HOST = previous;
  }
});
test('actual locked SDK constructs a checksummed conditional multipart write without authentication/network', async () => {
  const f = await sdkFixture(); await f.module.cloudWriteGenerated('artifact.glb', bytes, mime, path);
  const wire = f.requests.find(x => x.method === 'POST'); assert.equal(wire.qs.ifGenerationMatch, 0);
  assert.equal(wire.metadata.crc32c, crc32c(bytes)); assert.equal(wire.metadata.metadata.sha256, digest(bytes));
  assert.equal(wire.sha256, digest(bytes)); assert.ok(Number.isInteger(wire.timeout) && wire.timeout > 0 && wire.timeout <= 60000);
  assert.equal(f.replacementsDeleted(), 0);
  const metadata = f.requests.find(x => x.metadata === true);
  assert.equal(metadata.method, 'GET'); assert.ok(Number.isInteger(metadata.timeout) && metadata.timeout > 0 && metadata.timeout <= wire.timeout);
  assert.equal(metadata.maxRetries, 0);
  assert.equal(metadata.json, false); assert.ok(metadata.uri.endsWith(encodeURIComponent(path)));
  assert.equal(f.authAttempts(), 0);
  assert.deepEqual(f.scopedConfigurations.map(({ sdk: s, expectedCredential }) => ({ projectId: s.projectId, apiEndpoint: s.apiEndpoint, autoRetry: s.retryOptions.autoRetry,
    maxRetries: s.retryOptions.maxRetries, credentialRetained: s.authClient === expectedCredential })), [{ projectId: 'synthetic-asset-factory', apiEndpoint: 'https://storage.googleapis.com',
    autoRetry: false, maxRetries: 0, credentialRetained: true }]);
});
test('actual locked SDK checksum-failure cleanup cannot delete a later unrelated generation', async () => {
  const f = await sdkFixture({ corruptResponse: true });
  await assert.rejects(f.module.cloudWriteGenerated('artifact.glb', bytes, mime, path), /could not be deleted|uploaded data did not match/i);
  const cleanup = f.requests.find(x => x.method === 'DELETE'); assert.ok(cleanup, 'exercise actual SDK cleanup path');
  assert.equal(cleanup.qs.ifGenerationMatch, 0); assert.equal(f.replacementsDeleted(), 0); assert.equal(f.object().metadata.generation, '101');
  assert.equal(f.authAttempts(), 0);
});
async function sdkAuthorizationFixture({ rejectCredential = false, immediateCredential = false, manualDeadline = false } = {}) {
  const require = createRequire(import.meta.url);
  const adminPath = require.resolve('firebase-admin/storage', { paths: [resolve(root, 'assetfactory-studio')] });
  const sdkRequire = createRequire(adminPath);
  const sdkEntry = sdkRequire.resolve('@google-cloud/storage');
  assert.equal(JSON.parse(readFileSync(resolve(dirname(sdkEntry), '../../../package.json'), 'utf8')).version, '7.21.0');
  const { Storage } = sdkRequire('@google-cloud/storage');
  const { util } = sdkRequire(resolve(dirname(sdkEntry), 'nodejs-common/util.js'));
  const sdk = new Storage({ projectId: 'synthetic-asset-factory', retryOptions: { autoRetry: false } });
  const sharedAuthorize = sdk.authClient.authorizeRequest;
  const sharedRetries = { ...sdk.retryOptions };
  let releaseAuthorization, signalEntered, authAttempts = 0;
  const authorization = new Promise(resolve => { releaseAuthorization = resolve; });
  const entered = new Promise(resolve => { signalEntered = resolve; });
  const getClient = async () => {
    authAttempts++; signalEntered();
    if (rejectCredential) throw new Error('Could not load the default credentials: SYNTHETIC-PRIVATE-TOKEN');
    if (!immediateCredential) await authorization;
    return { async getRequestHeaders() { return {}; } };
  };
  // Exercise real GoogleAuth.authorizeRequest, replacing only credential lookup
  // and the terminal HTTP boundary. No token endpoint or provider is contacted.
  sdk.authClient.getClient = getClient;
  const originalMakeRequest = util.makeRequest;
  const wire = [];
  let elapsed = 0;
  util.makeRequest = (request, config, callback) => {
    wire.push({ method: request.method, uri: request.uri });
    (async () => {
      if (request.multipart) for await (const chunk of request.multipart[1].body) assert.ok(Buffer.isBuffer(chunk));
      callback(coded(403));
    })().catch(callback);
    return { abort() {} };
  };
  const context = vm.createContext({ Buffer, console, process: { env: {} }, clearTimeout,
    setTimeout(callback, delay) {
      assert.equal(delay, 60000, 'one source deadline includes SDK credential lookup');
      // Compress only timer scheduling; keep the real asynchronous SDK path.
      if (manualDeadline) return { unref() {} };
      return setTimeout(callback, 20);
    },
  });
  const module = await actualModule('cloudAssetFactoryStore', {
    './firebaseAdmin': { getAdminBucket: () => sdk.bucket('synthetic-asset-factory.appspot.com'), getAdminDb: () => null },
    'node:crypto': { createHash },
    'node:perf_hooks': manualDeadline ? { performance: { now: () => elapsed } } : { performance },
  }, context);
  return {
    module, wire, entered, releaseAuthorization, authAttempts: () => authAttempts,
    advanceElapsed(ms) { elapsed += ms; },
    assertSharedUnchanged() {
      assert.equal(sdk.authClient.authorizeRequest, sharedAuthorize);
      assert.equal(sdk.authClient.getClient, getClient);
      assert.deepEqual(sdk.retryOptions, sharedRetries);
    },
    async cleanup() {
      releaseAuthorization();
      for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve));
      util.makeRequest = originalMakeRequest;
    },
  };
}
for (const kind of ['write', 'read']) {
  test(`actual SDK delayed authorization cannot dispatch ${kind} after the source deadline`, async () => {
    const f = await sdkAuthorizationFixture();
    try {
      const operation = kind === 'write'
        ? f.module.cloudWriteGenerated('artifact.glb', bytes, mime, path)
        : f.module.cloudReadGenerated('artifact.glb', path);
      const rejected = assert.rejects(operation, kind === 'write' ? /upload deadline/ : /metadata deadline/);
      await f.entered; assert.equal(f.authAttempts(), 1);
      await withLiveSyntheticTransport(() => rejected);
      assert.equal(f.wire.length, 0);
      f.releaseAuthorization();
      await f.cleanup();
      assert.equal(f.wire.length, 0, 'late credential completion must not dispatch GCS');
      f.assertSharedUnchanged();
    } finally { await f.cleanup(); }
  });
}
for (const kind of ['write', 'read']) {
  test(`actual SDK checks monotonic ${kind} admission when authorization completes before a delayed timer fires`, async () => {
    const f = await sdkAuthorizationFixture({ manualDeadline: true });
    try {
      const operation = kind === 'write'
        ? f.module.cloudWriteGenerated('artifact.glb', bytes, mime, path)
        : f.module.cloudReadGenerated('artifact.glb', path);
      const rejected = assert.rejects(operation, kind === 'write' ? /upload deadline/ : /metadata deadline/);
      await f.entered; assert.equal(f.authAttempts(), 1);
      f.advanceElapsed(60001); f.releaseAuthorization();
      await rejected; await f.cleanup();
      assert.equal(f.wire.length, 0); f.assertSharedUnchanged();
    } finally { await f.cleanup(); }
  });
}
for (const kind of ['write', 'read']) {
  test(`actual SDK credential failure is redacted and cannot fall back to anonymous ${kind}`, async () => {
    const f = await sdkAuthorizationFixture({ rejectCredential: true });
    try {
      await assert.rejects(kind === 'write'
        ? f.module.cloudWriteGenerated('artifact.glb', bytes, mime, path)
        : f.module.cloudReadGenerated('artifact.glb', path), error => {
        // An immediate upload error may win the locked SDK's inner stream race.
        // Both exposed outcomes are fixed diagnostics without credential data.
        assert.ok(['Generated artifact Storage authorization is unavailable', 'Cannot call write after a stream was destroyed'].includes(error.message));
        if (kind === 'read') assert.equal(error.message, 'Generated artifact Storage authorization is unavailable');
        assert.ok(!error.message.includes('SYNTHETIC-PRIVATE-TOKEN')); return true;
      });
      assert.equal(f.authAttempts(), 1); assert.equal(f.wire.length, 0); f.assertSharedUnchanged();
    } finally { await f.cleanup(); }
  });
}
test('actual SDK timely authorization reaches one fenced transport and retains shared authority', async () => {
  const f = await sdkAuthorizationFixture({ immediateCredential: true });
  try {
    await assert.rejects(f.module.cloudWriteGenerated('artifact.glb', bytes, mime, path), /403/);
    assert.equal(f.authAttempts(), 1); assert.deepEqual(f.wire.map(request => request.method), ['POST']);
    f.assertSharedUnchanged();
  } finally { await f.cleanup(); }
});
test('different MIME type at the same version rejects without metadata mutation', async () => {
  const f = await storageFixture(); f.seed(); await assert.rejects(f.module.cloudWriteGenerated('artifact.glb', bytes, 'application/octet-stream', path), /conflicts/);
  assert.equal(f.objects.get(path).metadata.contentType, mime); assert.equal(f.calls.commits, 0);
});
test('caller buffer mutation during upload cannot change the snapshotted object', async () => {
  const original = Buffer.from(bytes); const f = await storageFixture({ beforeSave() { original.fill(0); } });
  await f.module.cloudWriteGenerated('artifact.glb', original, mime, path); assert.deepEqual(f.objects.get(path).buffer, bytes);
});
test('lost save response leaves a private object and an exact retry reuses it without another commit', async () => {
  const hooks = { saveError: 503, commitBeforeError: true }; const f = await storageFixture(hooks);
  await assert.rejects(f.module.cloudWriteGenerated('artifact.glb', bytes, mime, path), /503/); hooks.saveError = null;
  await f.module.cloudWriteGenerated('artifact.glb', bytes, mime, path); assert.equal(f.calls.commits, 1); assert.equal(f.calls.deletes, 0);
});
test('server checksum or transport error is propagated without retry loop or cleanup delete', async () => {
  for (const code of [400, 403, 429, 503]) { const f = await storageFixture({ saveError: code });
    await assert.rejects(f.module.cloudWriteGenerated('artifact.glb', bytes, mime, path), new RegExp(String(code)));
    assert.equal(f.calls.save.length, 1); assert.equal(f.calls.commits, 0); assert.equal(f.calls.deletes, 0); }
});
test('invalid SDK CRC32C generator prevents any upload', async () => {
  const f = await storageFixture({ generator: () => ({ update() {}, toString: () => 'false' }) });
  await assert.rejects(f.module.cloudWriteGenerated('artifact.glb', bytes, mime, path), /CRC32C/); assert.equal(f.calls.save.length, 0);
});
for (const objectPath of ['../private', 'tenants/a/../private', 'tenants//a', '/tenants/a', 'publicAssets/a', 'tenants/a\\b', 'tenants/a\u0000b']) {
  test(`invalid storage path rejects before SDK access: ${JSON.stringify(objectPath)}`, async () => {
    const f = await storageFixture(); await assert.rejects(f.module.cloudWriteGenerated('artifact.glb', bytes, mime, objectPath)); assert.equal(f.calls.save.length, 0);
  });
}
test('missing generated object returns null without a download', async () => {
  const f = await storageFixture(); assert.equal(await f.module.cloudReadGenerated('artifact.glb', path), null); assert.equal(f.calls.download.length, 0);
});
test('read is pinned to the metadata generation when the live name changes', async () => {
  let switched = false;
  const f = await storageFixture({ afterMetadata(_, __, state) { if (!switched) { switched = true; state.seed(Buffer.from('replaced generation')); } } });
  const prior = f.seed(bytes, { metadata: { sha256: digest(bytes) } });
  assert.deepEqual(await f.module.cloudReadGenerated('artifact.glb', path), bytes); assert.equal(f.calls.download[0].options.generation, prior.metadata.generation);
  assert.equal(f.calls.download[0].input.validation, 'crc32c'); assert.equal(f.calls.download[0].input.decompress, false);
});
test('corrupted downloaded bytes are rejected independently of the mocked SDK validator', async () => {
  const f = await storageFixture({ downloadBytes: Buffer.from('corrupted synthetic bytes') }); f.seed();
  await assert.rejects(f.module.cloudReadGenerated('artifact.glb', path), /size verification|checksum verification/); assert.equal(f.calls.deletes, 0);
});
test('a stalled read is destroyed at the actual source absolute deadline', async () => {
  const f = await storageFixture({ stalledRead: true }); f.seed();
  await withLiveSyntheticTransport(() => assert.rejects(f.module.cloudReadGenerated('artifact.glb', path), /read deadline/));
  assert.equal(f.calls.deletes, 0);
});
test('read rejects and destroys an overlong stream before accepting bytes', async () => {
  const f = await storageFixture({ downloadBytes: Buffer.alloc(bytes.length + 1) }); f.seed();
  await assert.rejects(f.module.cloudReadGenerated('artifact.glb', path), /size verification/); assert.equal(f.calls.deletes, 0);
});
test('tampered source SHA256 metadata blocks artifact read', async () => {
  const f = await storageFixture(); f.seed(bytes, { metadata: { sha256: '0'.repeat(64) } });
  await assert.rejects(f.module.cloudReadGenerated('artifact.glb', path), /checksum verification/);
});
for (const [name, metadata] of Object.entries({ missingGeneration: { generation: undefined }, unsafeGeneration: { generation: Number.MAX_SAFE_INTEGER + 1 }, booleanGeneration: { generation: true }, outOfRangeGeneration: { generation: '18446744073709551616' }, malformedSize: { size: '2e1' }, booleanSize: { size: true }, oversized: { size: '536870913' }, missingChecksum: { crc32c: undefined }, malformedChecksum: { crc32c: 'false' }, transcoded: { contentEncoding: 'gzip' }, falseEncoding: { contentEncoding: false }, nullEncoding: { contentEncoding: null } })) {
  test(`malformed or unsupported storage metadata rejects before download: ${name}`, async () => {
    const f = await storageFixture(); f.seed(bytes, metadata); await assert.rejects(f.module.cloudReadGenerated('artifact.glb', path)); assert.equal(f.calls.download.length, 0);
  });
}
test('stalled metadata destroys its SDK stream at the absolute source deadline without downloading or deleting', async () => {
  const f = await storageFixture({ stalledMetadata: true }); f.seed();
  await withLiveSyntheticTransport(() => assert.rejects(f.module.cloudReadGenerated('artifact.glb', path), /metadata deadline/));
  assert.equal(f.calls.download.length, 0); assert.equal(f.calls.deletes, 0);
  const call = f.calls.metadata[0]; assert.ok(Number.isInteger(call.input.timeout) && call.input.timeout > 0 && call.input.timeout <= 60000);
  assert.equal(call.input.maxRetries, 0);
});
for (const [name, hooks] of Object.entries({ oversized: { metadataPayload: 'x'.repeat(65537) }, invalidJson: { metadataPayload: '{bad' }, array: { metadataPayload: '[]' }, null: { metadataPayload: 'null' }, noResponse: { missingMetadataResponse: true }, wrongStatus: { metadataStatus: 403 }, stringStatus: { metadataStatus: '200' } })) {
  test(`metadata transport refuses unverified response before byte download: ${name}`, async () => {
    const f = await storageFixture(hooks); f.seed();
    await assert.rejects(f.module.cloudReadGenerated('artifact.glb', path));
    assert.equal(f.calls.download.length, 0); assert.equal(f.calls.deletes, 0);
  });
}
test('unrelated initialized Firebase app cannot select another project bucket', async () => {
  const foreign = { name: '[DEFAULT]', options: { projectId: 'urai-4dc1d', storageBucket: 'urai-4dc1d.appspot.com' } };
  const f = await adminFixture(target(), [foreign]);
  assert.equal(f.module.getAdminBucket().name, target().FIREBASE_STORAGE_BUCKET); assert.equal(f.module.getAdminDb().projectId, target().FIREBASE_PROJECT_ID);
  assert.equal(f.calls.initialize.length, 1); assert.equal(f.calls.initialize[0].name, 'asset-factory-admin'); assert.equal(f.apps[0].name, '[DEFAULT]');
});
test('named configured app reuses the SDK ADC identity without creating another app', async () => {
  const f = await adminFixture(target()); const first = f.module.getAdminApp(); assert.equal(f.module.getAdminApp(), first);
  assert.equal(f.calls.initialize.length, 1); assert.equal(f.calls.credentials, 2);
});
test('runtime target drift cannot redirect an existing named Factory app', async () => {
  const f = await adminFixture(target()); f.module.getAdminApp();
  f.env.FIREBASE_PROJECT_ID = 'another-asset-factory'; f.env.FIREBASE_STORAGE_BUCKET = 'another-asset-factory.appspot.com';
  assert.equal(f.module.getAdminBucket(), null); assert.equal(f.module.getAdminDb(), null); assert.equal(f.calls.initialize.length, 1);
});
for (const [name, env] of Object.entries({ missing: {}, malformed: { ...target(), FIREBASE_PROJECT_ID: 'wrong value' }, shared: { ...target(), FIREBASE_PROJECT_ID: 'urai-4dc1d', FIREBASE_STORAGE_BUCKET: 'urai-4dc1d.appspot.com' }, disagreed: { ...target(), ASSET_FACTORY_FIREBASE_PROJECT_ID: 'another-asset-factory' }, foreignBucket: { ...target(), FIREBASE_STORAGE_BUCKET: 'urai-4dc1d.appspot.com' } })) {
  test(`invalid project/bucket configuration never initializes or reads cloud services: ${name}`, async () => {
    const f = await adminFixture(env); assert.equal(f.module.getAdminApp(), null); assert.equal(f.module.getAdminBucket(), null); assert.equal(f.module.getAdminDb(), null);
    assert.equal(f.calls.initialize.length, 0); assert.equal(f.calls.bucket.length, 0); assert.equal(f.calls.db.length, 0);
  });
}
for (const key of ['FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY', 'FIREBASE_SERVICE_ACCOUNT_KEY', 'GOOGLE_APPLICATION_CREDENTIALS_JSON']) {
  test(`adopted ADC/WIF credential gate rejects ${key} before cached app reuse`, async () => {
    const f = await adminFixture({ ...target(), [key]: 'SYNTHETIC-PRIVATE-CREDENTIAL-NEVER-A-REAL-KEY' }, [{ name: 'asset-factory-admin', options: { projectId: target().FIREBASE_PROJECT_ID, storageBucket: target().FIREBASE_STORAGE_BUCKET } }]);
    assert.equal(f.module.getAdminApp(), null); assert.equal(f.calls.initialize.length, 0); assert.equal(f.calls.credentials, 0);
    assert.ok(!JSON.stringify(f.module.getFirebaseDiagnostics()).includes('SYNTHETIC-PRIVATE'));
  });
}
test('credential exception is redacted in diagnostics and a later valid setup can recover', async () => {
  let bad = true; const credential = { synthetic: true };
  const f = await adminFixture(target(), [], { applicationDefault() { if (bad) throw new Error('SYNTHETIC-SECRET-IN-SDK-ERROR'); return credential; } });
  assert.equal(f.module.getAdminApp(), null); assert.ok(!JSON.stringify(f.module.getFirebaseDiagnostics()).includes('SYNTHETIC-SECRET'));
  bad = false; assert.ok(f.module.getAdminApp()); assert.equal(f.module.getFirebaseDiagnostics().initError, null);
});
test('cached named app with a different credential object cannot adopt matching project/bucket labels', async () => {
  const f = await adminFixture(target(), [{ name: 'asset-factory-admin', options: { projectId: target().FIREBASE_PROJECT_ID, storageBucket: target().FIREBASE_STORAGE_BUCKET, credential: { syntheticCertificate: true } } }]);
  assert.equal(f.module.getAdminApp(), null); assert.equal(f.calls.initialize.length, 0); assert.equal(f.calls.bucket.length, 0); assert.equal(f.calls.db.length, 0);
});
const federation = { type: 'external_account', audience: '//iam.googleapis.com/projects/SYNTHETIC/locations/global/workloadIdentityPools/SYNTHETIC/providers/SYNTHETIC', subject_token_type: 'urn:ietf:params:oauth:token-type:jwt', token_url: 'https://sts.googleapis.com/v1/token', credential_source: { file: '/SYNTHETIC-NONEXISTENT-TOKEN' } };
for (const [name, config] of Object.entries({ serviceAccount: { type: 'service_account', private_key: 'SYNTHETIC-NEVER-A-KEY' }, authorizedUser: { type: 'authorized_user', refresh_token: 'SYNTHETIC-NEVER-A-TOKEN' }, keyInFederation: { ...federation, private_key: 'SYNTHETIC-NEVER-A-KEY' }, tokenInFederation: { ...federation, refresh_token: 'SYNTHETIC-NEVER-A-TOKEN' }, malformedEnvelope: [], malformedFederation: { type: 'external_account' } })) {
  test(`declared ADC configuration rejects long-lived or malformed credential source: ${name}`, async () => {
    const f = await adminFixture({ ...target(), GOOGLE_APPLICATION_CREDENTIALS: '/synthetic/adc.json' }, [], { adcFiles: { '/synthetic/adc.json': JSON.stringify(config) } });
    assert.equal(f.module.getAdminApp(), null); assert.equal(f.calls.credentials, 0); assert.equal(f.calls.initialize.length, 0);
    assert.ok(!JSON.stringify(f.module.getFirebaseDiagnostics()).includes('SYNTHETIC-NEVER'));
  });
}
test('a valid external-account declaration is admitted as configuration without any provider identity or token proof', async () => {
  const f = await adminFixture({ ...target(), GOOGLE_APPLICATION_CREDENTIALS: '/synthetic/adc.json' }, [], { adcFiles: { '/synthetic/adc.json': JSON.stringify(federation) } });
  assert.ok(f.module.getAdminApp()); assert.equal(f.calls.initialize.length, 1);
});
test('well-known ADC long-lived user credentials are rejected before cached app use', async () => {
  const f = await adminFixture({ ...target(), HOME: '/synthetic/home' }, [], { adcFiles: { '/synthetic/home/.config/gcloud/application_default_credentials.json': JSON.stringify({ type: 'authorized_user', refresh_token: 'SYNTHETIC-NEVER-A-TOKEN' }) } });
  assert.equal(f.module.getAdminApp(), null); assert.equal(f.calls.credentials, 0);
});
test('upper/lower ADC path drift and oversized credential declarations reject before SDK initialization', async () => {
  const drift = await adminFixture({ ...target(), GOOGLE_APPLICATION_CREDENTIALS: '/synthetic/one', google_application_credentials: '/synthetic/two' });
  assert.equal(drift.module.getAdminApp(), null); assert.equal(drift.calls.credentials, 0);
  const oversized = await adminFixture({ ...target(), GOOGLE_APPLICATION_CREDENTIALS: '/synthetic/big' }, [], { adcFiles: { '/synthetic/big': 'x'.repeat(65537) } });
  assert.equal(oversized.module.getAdminApp(), null); assert.equal(oversized.calls.credentials, 0);
});
test('Firestore can use the dedicated target without an implicit Storage bucket', async () => {
  const f = await adminFixture({ FIREBASE_PROJECT_ID: target().FIREBASE_PROJECT_ID });
  assert.equal(f.module.getAdminDb().projectId, target().FIREBASE_PROJECT_ID); assert.equal(f.module.getAdminBucket(), null); assert.equal(f.calls.bucket.length, 0);
});

test('legacy development project is available only outside production', async () => {
  const env = { FIREBASE_PROJECT_ID: 'asset-factory-dev-id', FIREBASE_STORAGE_BUCKET: 'asset-factory-dev-id.appspot.com' };
  const development = await adminFixture({ ...env, NODE_ENV: 'development' }); assert.ok(development.module.getAdminApp());
  const production = await adminFixture({ ...env, NODE_ENV: 'production' }); assert.equal(production.module.getAdminApp(), null); assert.equal(production.calls.initialize.length, 0);
});
for (const name of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST', 'STORAGE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']) {
  test(`production cannot substitute local emulator authority: ${name}`, async () => {
    const f = await adminFixture({ ...target(), NODE_ENV: 'production', [name]: '127.0.0.1:9199' });
    assert.equal(f.module.getAdminApp(), null); assert.equal(f.calls.initialize.length, 0); assert.equal(f.calls.credentials, 0);
  });
}
for (const projectId of ['urai-labs-llc', 'urai-labs-llc-78824152-ad18d', 'urai-foundation', 'lifelogger-cgth1']) {
  test(`known other estate project is not Factory persistence authority: ${projectId}`, async () => {
    const f = await adminFixture({ FIREBASE_PROJECT_ID: projectId, FIREBASE_STORAGE_BUCKET: `${projectId}.appspot.com` });
    assert.equal(f.module.getAdminApp(), null); assert.equal(f.calls.initialize.length, 0);
  });
}

async function backendFixture(env, available) {
  let checks = 0;
  const module = await actualModule('assetBackend', {
    './firebaseAdmin': { isFirebaseAdminAvailable() { checks++; return available; } },
    './cloudAssetFactoryStore': {}, './localAssetFactoryStore': {},
  }, vm.createContext({ Buffer, console, process: { env } }));
  return { module, checks: () => checks };
}
test('production missing Firebase authority cannot silently persist to local JSON', async () => {
  const f = await backendFixture({ NODE_ENV: 'production' }, false);
  assert.throws(() => f.module.activeAssetBackend(), /local fallback is denied/);
});
test('production explicit local forcing is rejected before credential initialization', async () => {
  const f = await backendFixture({ NODE_ENV: 'production', ASSET_FACTORY_FORCE_LOCAL: 'true' }, true);
  assert.throws(() => f.module.activeAssetBackend(), /durable Firebase/); assert.equal(f.checks(), 0);
});
test('development local proof fallback and an available production cloud target remain usable', async () => {
  const local = await backendFixture({ NODE_ENV: 'development', ASSET_FACTORY_FORCE_LOCAL: 'true' }, false);
  assert.equal(local.module.activeAssetBackend().mode, 'local-json'); assert.equal(local.checks(), 0);
  const unavailable = await backendFixture({ NODE_ENV: 'development' }, false); assert.equal(unavailable.module.activeAssetBackend().mode, 'local-json');
  const cloud = await backendFixture({ NODE_ENV: 'production' }, true); assert.equal(cloud.module.activeAssetBackend().mode, 'firestore-storage');
});
