import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';

function actualExport(file, name) {
  const text = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
  const start = text.indexOf(`export async function ${name}(`);
  assert.ok(start >= 0);
  const tail = text.slice(start).replace(/^export /, '');
  const next = tail.slice(1).search(/\n(?:export )?(?:async )?function \w+\(/);
  return stripTypeScriptTypes(next < 0 ? tail : tail.slice(0, next + 1), { mode: 'strip' });
}

for (const [file, name, providers] of [
  ['../assetfactory-studio/lib/server/assetProviderRuntime.ts', 'renderWithConfiguredProvider', ['openai', 'elevenlabs', 'stability', 'replicate', 'fal', 'higgsfield']],
  ['../assetfactory-studio/lib/server/assetVideoProviderRuntime.ts', 'renderVideoWithConfiguredProvider', ['replicate', 'fal', 'runway', 'higgsfield']],
]) {
  test(`actual ${name} retains local proof and blocks every configured paid provider before dispatch`, async () => {
    let provider = 'local-proof'; let calls = 0;
    const called = async () => { calls++; throw new Error('provider should never run'); };
    const context = vm.createContext({ configuredProviderName: () => provider, env: () => provider, renderProvider: called, renderReplicate: called, renderConfiguredHttpProvider: called, renderHiggsfield: called });
    vm.runInContext(actualExport(file, name), context);
    assert.equal(await context[name]({ prompt: 'fictional-test' }, { canonicalType: 'graphic' }), null);
    for (provider of providers) await assert.rejects(context[name]({ prompt: 'fictional-test' }, { canonicalType: 'graphic' }), /disabled pending authenticated shared protected-executor integration/);
    assert.equal(calls, 0);
  });
}
