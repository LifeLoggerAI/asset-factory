const test = require('node:test');
const assert = require('node:assert/strict');
const { buildShort, buildLong, buildThread } = require('../formats');

function validatePreset(preset) {
  assert.ok(preset.type);
  assert.ok(Array.isArray(preset.hooks) && preset.hooks.length > 0);
  assert.ok(Array.isArray(preset.structure) && preset.structure.length > 0);
  assert.ok(typeof preset.durationTarget === 'string');
}

test('buildShort generates deterministic preset for a topic', () => {
  const a = buildShort('AI');
  const b = buildShort('AI');
  assert.deepEqual(a, b);
  validatePreset(a);
});

test('buildLong generates deterministic preset for a topic', () => {
  const a = buildLong('AI');
  const b = buildLong('AI');
  assert.deepEqual(a, b);
  validatePreset(a);
});

test('buildThread generates deterministic preset for a topic', () => {
  const a = buildThread('AI');
  const b = buildThread('AI');
  assert.deepEqual(a, b);
  validatePreset(a);
});
