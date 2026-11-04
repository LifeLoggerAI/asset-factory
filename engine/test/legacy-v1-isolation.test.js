const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const engineDir = path.resolve(__dirname, '..');
const serverText = fs.readFileSync(path.join(engineDir, 'server.v1.js'), 'utf8');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'urai-legacy-v1-test-'));
const userPath = path.join(work, 'private-users.json');
const dbPath = path.join(work, 'private-jobs.json');
fs.writeFileSync(userPath, '[]', { mode: 0o600 });
fs.writeFileSync(dbPath, '{"jobs":[]}', { mode: 0o600 });
test.after(() => fs.rmSync(work, { recursive: true, force: true }));
const keyA = 'owner-a-private-key-for-local-test-123456';
const keyB = 'owner-b-private-key-for-local-test-123456';
const userRecords = [
  { id: 'owner-a', apiKey: keyA, usage: { lastReset: new Date().toISOString(), jobsThisMonth: 0 }, quota: { jobsPerMonth: 10 } },
  { id: 'owner-b', apiKey: keyB, usage: { lastReset: new Date().toISOString(), jobsThisMonth: 0 }, quota: { jobsPerMonth: 10 } },
];

function loadV1(env = {}, jobs = []) {
  const routes = { get: {}, post: {} };
  const reads = [];
  const writes = [];
  const db = { jobs: JSON.parse(JSON.stringify(jobs)) };
  const users = JSON.parse(JSON.stringify(userRecords));
  const app = {
    use() {},
    get(name, ...handlers) { routes.get[name] = handlers; },
    post(name, ...handlers) { routes.post[name] = handlers; },
    listen(...args) { this.boundArgs = args; return { close() {} }; },
  };
  function express() { return app; }
  express.json = () => () => {};
  const fsFake = { promises: {
    async readFile(file) {
      reads.push(file);
      if (path.basename(file).includes('user')) return JSON.stringify(users);
      return JSON.stringify(db);
    },
    async writeFile(file, data) {
      writes.push(file);
      if (path.basename(file).includes('user')) {
        const next = JSON.parse(data);
        users.splice(0, users.length, ...next);
      } else {
        db.jobs = JSON.parse(data).jobs;
      }
    },
  } };
  const dependencies = {
    express,
    child_process: { fork() { return { send() {} }; } },
    fs: fsFake,
    path,
    uuid: { v4() { return 'new-job-local'; } },
    './legacy-v1-access': () => require(path.join(engineDir, 'legacy-v1-access.js')),
  };
  const context = {
    process: { env },
    __dirname: engineDir,
    require(name) {
      if (!(name in dependencies)) throw new Error('Unexpected dependency: ' + name);
      return typeof dependencies[name] === 'function' && name === './legacy-v1-access'
        ? dependencies[name]() : dependencies[name];
    },
    console: { log() {}, error() {} },
    Date, JSON, Error, Buffer, setTimeout,
  };
  vm.runInNewContext(serverText, context, { filename: 'server.v1.js' });
  async function execute(method, route, request) {
    const handlers = routes[method][route];
    assert.ok(handlers, 'expected route ' + method + ' ' + route);
    let finished = false;
    let response;
    const res = {
      code: 200,
      status(code) { this.code = code; return this; },
      json(body) { response = body; finished = true; return this; },
    };
    for (const fn of handlers) {
      let nextCalled = false;
      await fn(request, res, () => { nextCalled = true; });
      if (finished || !nextCalled) break;
    }
    return { code: res.code, body: response };
  }
  return { app, db, reads, writes, execute };
}
function envLocal(overrides = {}) {
  return {
    NODE_ENV: 'test',
    ASSET_FACTORY_ENABLE_LEGACY_V1_SERVER: 'true',
    ASSET_FACTORY_LEGACY_V1_USERS_FILE: userPath,
    ASSET_FACTORY_LEGACY_V1_DB_FILE: dbPath,
    ...overrides,
  };
}
function reqFor(key, extras = {}) {
  return { headers: { 'x-api-key': key }, params: { jobId: 'private-job-a' }, body: { prompt: 'test prompt', format: 'short' }, ...extras };
}

test('legacy V1 cannot start in production even if explicitly opted in', () => {
  assert.throws(() => loadV1(envLocal({ NODE_ENV: 'production' })), /Legacy V1 .*disabled|not allowed|local-only/);
});
test('legacy V1 cannot start without explicit opt in', () => {
  assert.throws(() => loadV1(envLocal({ ASSET_FACTORY_ENABLE_LEGACY_V1_SERVER: undefined })), /Legacy V1 .*disabled|not allowed|local-only/);
});
test('legacy V1 rejects a source-tree file as credential authority', () => {
  assert.throws(() => loadV1(envLocal({ ASSET_FACTORY_LEGACY_V1_USERS_FILE: path.join(engineDir, 'server.v1.js') })), /Legacy V1 .*outside|source|repository|path/);
});
test('legacy V1 refuses absent external private job database', () => {
  assert.throws(() => loadV1(envLocal({ ASSET_FACTORY_LEGACY_V1_DB_FILE: undefined })), /Legacy V1 .*outside|source|repository|path/);
});
test('legacy V1 rejects relative credential paths', () => {
  assert.throws(() => loadV1(envLocal({ ASSET_FACTORY_LEGACY_V1_USERS_FILE: 'private-users.json' })), /Legacy V1 .*outside|source|repository|path/);
});
test('legacy V1 rejects group-readable key files on POSIX', { skip: process.platform === 'win32' }, () => {
  const weakMode = path.join(work, 'weak-mode-users.json');
  fs.writeFileSync(weakMode, '[]', { mode: 0o644 });
  fs.chmodSync(weakMode, 0o644);
  assert.throws(() => loadV1(envLocal({ ASSET_FACTORY_LEGACY_V1_USERS_FILE: weakMode })), /Legacy V1 .*readable by group or others/);
});
test('legacy V1 rejects a symlink outside the tree that points back into source', { skip: process.platform === 'win32' }, () => {
  const link = path.join(work, 'source-symlink.json');
  fs.symlinkSync(path.join(engineDir, 'server.v1.js'), link);
  assert.throws(() => loadV1(envLocal({ ASSET_FACTORY_LEGACY_V1_USERS_FILE: link })), /Legacy V1 .*outside|source|repository/);
});
test('legacy V1 binds loopback exclusively', () => {
  const runtime = loadV1(envLocal());
  assert.equal(runtime.app.boundArgs[1], '127.0.0.1');
});
test('legacy V1 rejects cross-owner read even with a valid API key', async () => {
  const runtime = loadV1(envLocal(), [{ id: 'private-job-a', ownerUserId: 'owner-a', prompt: 'private', status: 'queued' }]);
  const result = await runtime.execute('get', '/v1/jobs/:jobId', reqFor(keyB));
  assert.equal(result.code, 404);
  assert.equal(result.body?.prompt, undefined);
});
test('legacy V1 permits rightful owner to read own scoped job', async () => {
  const runtime = loadV1(envLocal(), [{ id: 'private-job-a', ownerUserId: 'owner-a', prompt: 'private', status: 'queued' }]);
  const result = await runtime.execute('get', '/v1/jobs/:jobId', reqFor(keyA));
  assert.equal(result.code, 200);
  assert.equal(result.body?.ownerUserId, 'owner-a');
});
test('legacy V1 rejects source-owned legacy jobs without trusted owner metadata', async () => {
  const runtime = loadV1(envLocal(), [{ id: 'private-job-a', prompt: 'unowned source seed', status: 'queued' }]);
  const result = await runtime.execute('get', '/v1/jobs/:jobId', reqFor(keyA));
  assert.equal(result.code, 404);
});
test('legacy V1 stamps authenticated owner on new jobs', async () => {
  const runtime = loadV1(envLocal());
  const result = await runtime.execute('post', '/v1/jobs', reqFor(keyB));
  assert.equal(result.code, 202);
  assert.equal(result.body?.ownerUserId, 'owner-b');
  assert.equal(runtime.db.jobs[0]?.ownerUserId, 'owner-b');
});
test('legacy V1 runtime never reads or writes checked-in credential and job seed files', async () => {
  const runtime = loadV1(envLocal());
  await runtime.execute('post', '/v1/jobs', reqFor(keyA));
  assert.ok(runtime.reads.includes(userPath));
  assert.ok(runtime.reads.includes(dbPath));
  assert.ok(runtime.writes.includes(userPath));
  assert.ok(runtime.writes.includes(dbPath));
  assert.ok(runtime.reads.every(f => path.resolve(f).startsWith(work + path.sep)));
  assert.ok(runtime.writes.every(f => path.resolve(f).startsWith(work + path.sep)));
});
