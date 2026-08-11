import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('scripts/chaos.js', 'utf8');

assert.match(source, /credential\.applicationDefault\(\)/);
assert.match(source, /URAI_CHAOS_TEST_APPROVED/);
assert.match(source, /URAI_CHAOS_TEST_PROJECT_ID/);
assert.match(source, /urai-4dc1d/);
assert.match(source, /Refusing chaos test against the production Firebase project/);
assert.doesNotMatch(source, /service-account\.json/);
assert.doesNotMatch(source, /credential\.cert\(/);
assert.doesNotMatch(source, /FIREBASE_SERVICE_ACCOUNT/);

console.log('asset-factory chaos credential boundary passed');
