import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pagePath = process.env.ASSET_FACTORY_STUDIO_TEST_PAGE ?? path.join(root, 'assetfactory-studio/app/page.tsx');
const require = createRequire(import.meta.url);
const ts = require(process.env.ASSET_FACTORY_STUDIO_TEST_TYPESCRIPT ?? path.join(root, 'assetfactory-studio/node_modules/typescript'));
const compiled = ts.transpileModule(fs.readFileSync(pagePath, 'utf8'), {
  fileName: pagePath,
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

// Execute the real page and asynchronous handlers. Only React scheduling, layout,
// UUIDs, and network responses are deterministic substitutes; no API/provider is called.
function mountPage() {
  const hooks = [];
  const requests = [];
  const writesAfterUnmount = [];
  let cursor = 0;
  let dirty = true;
  let tree;
  let mounted = true;
  let effects = [];
  let uuid = 0;
  const sameDeps = (left, right) => left && right && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
  function slot(kind, initial) {
    const index = cursor++;
    if (!hooks[index]) hooks[index] = { kind, ...initial() };
    assert.equal(hooks[index].kind, kind, 'hook order must remain stable');
    return hooks[index];
  }
  const react = {
    useState(initial) {
      const hook = slot('state', () => ({ value: typeof initial === 'function' ? initial() : initial }));
      hook.set ??= (value) => {
        if (!mounted) { writesAfterUnmount.push(value); return; }
        const next = typeof value === 'function' ? value(hook.value) : value;
        if (!Object.is(next, hook.value)) { hook.value = next; dirty = true; }
      };
      return [hook.value, hook.set];
    },
    useRef(initial) { return slot('ref', () => ({ value: { current: initial } })).value; },
    useMemo(factory, deps) {
      const hook = slot('memo', () => ({}));
      if (!sameDeps(hook.deps, deps)) { hook.value = factory(); hook.deps = deps; }
      return hook.value;
    },
    useCallback(callback, deps) { return react.useMemo(() => callback, deps); },
    useEffect(effect, deps) {
      const hook = slot('effect', () => ({}));
      if (!sameDeps(hook.deps, deps)) {
        hook.deps = deps;
        effects.push(() => { hook.cleanup?.(); hook.cleanup = effect(); });
      }
    },
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require(name) {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
      if (name === 'uuid') return { v4: () => `test-${++uuid}` };
      if (name === '../components/layout/DesignSystem') return { AppShell: 'test-shell', Button: 'test-button' };
      throw new Error(`Unexpected page import: ${name}`);
    },
    fetch(url, options) {
      const pending = deferred();
      requests.push({ url, options, ...pending });
      return pending.promise;
    },
    Date,
    Error,
    console,
  }, { filename: pagePath });
  function render() {
    let attempts = 0;
    while (dirty && mounted) {
      assert.ok(++attempts < 30, 'page must settle synchronous state');
      dirty = false;
      cursor = 0;
      tree = exports.default();
      const pendingEffects = effects;
      effects = [];
      pendingEffects.forEach((effect) => effect());
    }
    return tree;
  }
  function visit(node, matches) {
    if (Array.isArray(node)) return node.forEach((child) => visit(child, matches));
    if (!node || typeof node !== 'object') return;
    matches.push(node);
    visit(node.props?.children, matches);
  }
  function nodes() { render(); const all = []; visit(tree, all); return all; }
  function find(predicate) { const found = nodes().find(predicate); assert.ok(found, 'requested page control must exist'); return found; }
  function text(node) {
    if (arguments.length === 0) node = render();
    if (Array.isArray(node)) return node.map((child) => text(child)).join(' ');
    if (node === null || node === undefined || typeof node === 'boolean') return '';
    if (typeof node !== 'object') return String(node);
    return text(node.props?.children);
  }
  async function drain() { for (let index = 0; index < 20; index += 1) { await Promise.resolve(); render(); } }
  function input(id, value) { find((node) => node.props?.id === id).props.onChange({ target: { value } }); render(); }
  function button(label) { return find((node) => node.type === 'test-button' && text(node).includes(label)); }
  function request(tenant, suffix, method = 'GET') {
    const found = requests.filter((entry) => entry.options.headers['x-tenant-id'] === tenant && entry.url.endsWith(suffix) && (entry.options.method ?? 'GET') === method).at(-1);
    assert.ok(found, `request ${tenant} ${method} ${suffix} must exist`);
    return found;
  }
  function respond(entry, body, { ok = true, bodyPromise } = {}) { entry.resolve({ ok, json: () => bodyPromise ?? Promise.resolve(body) }); }
  async function populate(tenant, { asset = false, prompt = `${tenant}-private-prompt`, jobId = `${tenant}-job` } = {}) {
    respond(request(tenant, '/api/jobs'), [{ jobId, tenantId: tenant, prompt, type: 'graphic', status: 'completed' }]);
    respond(request(tenant, '/api/assets'), asset ? [{ jobId, fileName: `${tenant}-private.svg`, manifestFile: `${tenant}-private.json`, published: false }] : []);
    await drain();
  }
  function submit() { return find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} }); }
  function unmount() { mounted = false; hooks.forEach((hook) => { if (hook.kind === 'effect') hook.cleanup?.(); }); }
  render();
  return { requests, request, respond, input, button, populate, submit, unmount, writesAfterUnmount, text, nodes, drain };
}

test('changing tenant clears previous jobs and asset links before replacement requests finish', async () => {
  const page = mountPage();
  page.input('tenantId', 'tenant-a');
  await page.populate('tenant-a', { asset: true });
  assert.match(page.text(), /tenant-a-private-prompt/);
  page.input('tenantId', 'tenant-b');
  assert.doesNotMatch(page.text(), /tenant-a-private-prompt/);
  assert.ok(!page.nodes().some((node) => node.props?.href?.includes('tenant-a-private')));
});

test('late jobs and assets from a previous tenant cannot repopulate history', async () => {
  const page = mountPage();
  page.input('tenantId', 'tenant-a');
  page.input('tenantId', 'tenant-b');
  await page.populate('tenant-b');
  await page.populate('tenant-a', { asset: true });
  assert.match(page.text(), /tenant-b-private-prompt/);
  assert.doesNotMatch(page.text(), /tenant-a-private/);
  assert.ok(!page.nodes().some((node) => node.props?.href?.includes('tenant-a-private')));
});

test('tenant change while response JSON is pending also rejects the old payload', async () => {
  const page = mountPage();
  const body = deferred();
  page.input('tenantId', 'tenant-a');
  page.respond(page.request('tenant-a', '/api/jobs'), null, { bodyPromise: body.promise });
  await page.drain();
  page.input('tenantId', 'tenant-b');
  await page.populate('tenant-b');
  body.resolve([{ jobId: 'old-a', prompt: 'tenant-a-private-delayed-json' }]);
  await page.drain();
  assert.match(page.text(), /tenant-b-private-prompt/);
  assert.doesNotMatch(page.text(), /tenant-a-private-delayed-json/);
});

test('A to B to A does not admit the original A response into the new A visit', async () => {
  const page = mountPage();
  page.input('tenantId', 'tenant-a');
  const oldJobs = page.request('tenant-a', '/api/jobs');
  const oldAssets = page.request('tenant-a', '/api/assets');
  page.input('tenantId', 'tenant-b');
  page.input('tenantId', 'tenant-a');
  await page.populate('tenant-a', { prompt: 'current-a-visit' });
  page.respond(oldJobs, [{ jobId: 'old-a', prompt: 'original-a-private' }]);
  page.respond(oldAssets, []);
  await page.drain();
  assert.match(page.text(), /current-a-visit/);
  assert.doesNotMatch(page.text(), /original-a-private/);
});

test('older refreshes for the same normalized tenant cannot replace a newer result', async () => {
  const page = mountPage();
  page.input('tenantId', 'tenant-a');
  const oldJobs = page.request('tenant-a', '/api/jobs');
  const oldAssets = page.request('tenant-a', '/api/assets');
  page.input('tenantId', ' tenant-a ');
  await page.populate('tenant-a', { prompt: 'latest-a-refresh' });
  page.respond(oldJobs, [{ jobId: 'old-a', prompt: 'older-a-refresh' }]);
  page.respond(oldAssets, []);
  await page.drain();
  assert.match(page.text(), /latest-a-refresh/);
  assert.doesNotMatch(page.text(), /older-a-refresh/);
});

test('stale fetch rejection does not set the next tenant error or stop its refresh indicator', async () => {
  const page = mountPage();
  page.input('tenantId', 'tenant-a');
  const oldJobs = page.request('tenant-a', '/api/jobs');
  page.input('tenantId', 'tenant-b');
  oldJobs.reject(new Error('tenant-a-private-network-error'));
  await page.drain();
  assert.doesNotMatch(page.text(), /tenant-a-private-network-error/);
  assert.equal(page.button('Refreshing').props.disabled, true);
});

for (const ok of [true, false]) {
  test(`late generation ${ok ? 'success' : 'failure'} cannot change a new tenant submission`, async () => {
    const page = mountPage();
    page.input('tenantId', 'tenant-a');
    page.input('prompt', 'tenant-a-draft');
    const oldAction = page.submit();
    const oldRequest = page.request('tenant-a', '/api/generate', 'POST');
    const body = JSON.parse(oldRequest.options.body);
    assert.equal(body.tenantId, 'tenant-a');
    assert.equal(oldRequest.options.headers['Idempotency-Key'], body.jobId);
    page.input('tenantId', 'tenant-b');
    page.input('prompt', 'tenant-b-draft');
    page.submit();
    const requestCount = page.requests.length;
    page.respond(oldRequest, { jobId: 'tenant-a-private-job', error: 'tenant-a-private-denial' }, { ok });
    await page.drain();
    assert.equal(page.requests.length, requestCount, 'old completion must not start a refresh');
    assert.match(page.text(), /Submitting generation job/);
    assert.doesNotMatch(page.text(), /tenant-a-private/);
    assert.equal(page.button('Working').props.disabled, true);
    await oldAction;
  });
}

for (const operation of ['materialize', 'publish']) {
  test(`late ${operation} JSON does not expose old status/error or clear the new tenant busy state`, async () => {
    const page = mountPage();
    const body = deferred();
    page.input('tenantId', 'tenant-a');
    await page.populate('tenant-a', { asset: operation === 'publish' });
    page.button(operation === 'publish' ? 'Publish' : 'Materialize').props.onClick();
    const oldRequest = page.request('tenant-a', `/${operation}`, 'POST');
    page.respond(oldRequest, null, { ok: operation === 'materialize', bodyPromise: body.promise });
    await page.drain();
    page.input('tenantId', 'tenant-b');
    await page.populate('tenant-b', { asset: operation === 'publish' });
    page.button(operation === 'publish' ? 'Publish' : 'Materialize').props.onClick();
    const requestCount = page.requests.length;
    body.resolve({ asset: { fileName: 'tenant-a-private-output.svg' }, error: 'tenant-a-private-denial' });
    await page.drain();
    assert.equal(page.requests.length, requestCount);
    assert.match(page.text(), operation === 'publish' ? /Publishing tenant-b-job/ : /Materializing tenant-b-job/);
    assert.doesNotMatch(page.text(), /tenant-a-private/);
    assert.equal(page.button('Working').props.disabled, true);
  });
}

test('pending requests do not write component state after unmount', async () => {
  const page = mountPage();
  page.input('tenantId', 'tenant-a');
  const oldJobs = page.request('tenant-a', '/api/jobs');
  page.unmount();
  page.respond(oldJobs, [{ jobId: 'old-a', prompt: 'tenant-a-private' }]);
  await page.drain();
  assert.deepEqual(page.writesAfterUnmount, []);
});

test('current tenant generation retains request payload, accepted result and refreshed history', async () => {
  const page = mountPage();
  page.input('tenantId', ' tenant-a ');
  await page.populate('tenant-a');
  page.input('prompt', 'current draft');
  const action = page.submit();
  const generate = page.request('tenant-a', '/api/generate', 'POST');
  const body = JSON.parse(generate.options.body);
  assert.equal(body.prompt, 'current draft');
  assert.equal(body.type, 'graphic');
  assert.deepEqual(body.size, { width: 1024, height: 1024 });
  assert.equal(body.transparentBackground, false);
  assert.equal(body.metadata.source, 'assetfactory-studio');
  page.respond(generate, { canonicalType: 'graphic', jobId: 'new-a-job', estimatedUnits: 2 });
  await page.drain();
  await page.populate('tenant-a', { asset: true, jobId: 'new-a-job', prompt: 'accepted-current-prompt' });
  await action;
  await page.drain();
  assert.match(page.text(), /Queued graphic job new-a-job/);
  assert.match(page.text(), /accepted-current-prompt/);
  assert.equal(page.button('Create Graphic Job').props.disabled, false);
});

test('current tenant errors remain visible and release busy state', async () => {
  const page = mountPage();
  page.input('tenantId', 'tenant-a');
  page.input('prompt', 'current draft');
  const action = page.submit();
  page.respond(page.request('tenant-a', '/api/generate', 'POST'), { error: 'current tenant denied' }, { ok: false });
  await action;
  await page.drain();
  assert.match(page.text(), /current tenant denied/);
  assert.equal(page.button('Create Graphic Job').props.disabled, false);
});

test('clearing the tenant clears history, makes no anonymous refresh and rejects late errors', async () => {
  const page = mountPage();
  page.input('tenantId', 'tenant-a');
  const oldJobs = page.request('tenant-a', '/api/jobs');
  page.input('tenantId', '');
  const requestCount = page.requests.length;
  oldJobs.reject(new Error('tenant-a-private-error'));
  await page.drain();
  assert.equal(page.requests.length, requestCount);
  assert.doesNotMatch(page.text(), /tenant-a-private-error|Unable to refresh jobs/);
  assert.equal(page.button('Refresh').props.disabled, true);
});


test('tenant-specific drafts are cleared while shared type and sizing controls remain', async () => {
  const page = mountPage();
  page.input('tenantId', 'tenant-a');
  page.input('prompt', 'tenant-a-private-draft');
  page.nodes().find((node) => node.props?.type === 'radio' && node.props.value === 'model3d').props.onChange();
  await page.drain();
  page.nodes().find((node) => node.props?.type === 'number' && node.props.min === 64).props.onChange({ target: { value: '1200' } });
  page.input('tenantId', 'tenant-b');
  assert.equal(page.nodes().find((node) => node.props?.id === 'prompt').props.value, '');
  assert.equal(page.nodes().find((node) => node.props?.type === 'radio' && node.props.value === 'model3d').props.checked, true);
  assert.equal(page.nodes().find((node) => node.props?.type === 'number' && node.props.min === 64).props.value, 1200);
  assert.equal(page.button('Create 3D Model Job').props.disabled, true);
  page.input('prompt', 'tenant-b-draft');
  page.submit();
  const body = JSON.parse(page.request('tenant-b', '/api/generate', 'POST').options.body);
  assert.equal(body.prompt, 'tenant-b-draft');
  assert.equal(body.type, 'model3d');
  assert.equal(body.size.width, 1200);
  assert.equal(body.tenantId, 'tenant-b');
});
