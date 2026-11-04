import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkTriangleBudget } from '../model_forge/triangle-budget.mjs';

function geometry(mode, indexed, count) {
  return { asset: { version: '2.0' }, accessors: [{ count }], meshes: [{ primitives: [
    { mode, ...(indexed ? { indices: 0 } : { attributes: { POSITION: 0 } }) },
  ] }] };
}
for (const indexed of [true, false]) {
  for (const [mode, count, expected] of [[4, 12, 4], [5, 6, 4], [6, 6, 4]]) {
    test(`${indexed ? 'indexed' : 'nonindexed'} mode ${mode} enforces boundary`, () => {
      const gltf = geometry(mode, indexed, count);
      assert.equal(checkTriangleBudget(gltf, 4).triangles, expected);
      assert.throws(() => checkTriangleBudget(gltf, 3), /exceeds budget/);
    });
  }
}
test('aggregate geometry counts across meshes and preserves indexed receipt field', () => {
  const gltf = geometry(4, true, 12);
  gltf.meshes.push(...geometry(5, false, 12).meshes);
  assert.deepEqual(checkTriangleBudget(gltf, 14), { triangles: 14, indexedTriangles: 4, indexedTrianglePrimitives: 1 });
  assert.throws(() => checkTriangleBudget(gltf, 13), /exceeds budget/);
});
test('reject malformed budgets and triangle accessors', () => {
  for (const budget of [NaN, Infinity, -1, 1.5, '100', Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => checkTriangleBudget(geometry(4, true, 3), budget), /budget must/);
  }
  for (const count of [undefined, -1, 0, 1.5, '3', Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => checkTriangleBudget(geometry(4, false, count), 100), /accessor count/);
  }
  const missing = geometry(4, false, 3);
  missing.meshes[0].primitives[0].attributes = {};
  assert.throws(() => checkTriangleBudget(missing, 100), /valid count accessor/);
});
test('standalone GLB CLI rejects nonindexed over-budget geometry and NaN budget', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'urai-glb-budget-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const json = JSON.stringify(geometry(4, false, 12));
  const chunk = Buffer.from(json.padEnd(Math.ceil(json.length / 4) * 4, ' '));
  const buffer = Buffer.alloc(20 + chunk.length);
  buffer.write('glTF'); buffer.writeUInt32LE(2, 4); buffer.writeUInt32LE(buffer.length, 8);
  buffer.writeUInt32LE(chunk.length, 12); buffer.writeUInt32LE(0x4e4f534a, 16); chunk.copy(buffer, 20);
  const file = path.join(dir, 'candidate.glb'); fs.writeFileSync(file, buffer);
  const validator = fileURLToPath(new URL('../model_forge/validate-glb.mjs', import.meta.url));
  for (const budget of ['3', 'NaN']) {
    const result = spawnSync(process.execPath, [validator, file, budget], { encoding: 'utf8' });
    assert.equal(result.status, 1, result.stdout);
  }
  const pass = spawnSync(process.execPath, [validator, file, '4'], { encoding: 'utf8' });
  assert.equal(pass.status, 0, pass.stderr);
  assert.equal(JSON.parse(pass.stdout).trianglesEstimated, 4);
});
