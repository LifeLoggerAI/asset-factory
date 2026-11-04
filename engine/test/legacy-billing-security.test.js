const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the exact TypeScript function bodies without installing Next or
// contacting Firebase or Stripe. This is not a production billing test.
const source = fs.readFileSync(path.resolve(__dirname, '../../assetfactory-studio/lib/billing.ts'), 'utf8');
function extract(name) {
  const start = source.indexOf('export async function ' + name + '(');
  assert.ok(start >= 0, name + ' must be exported');
  const open = source.indexOf('{', start);
  assert.ok(open > start, name + ' must have a body');
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') depth -= 1;
    if (depth === 0) return 'async function ' + name + '(_tenantId) ' + source.slice(open, i + 1).replace(/\s+as const\b/g, '');
  }
  throw new Error(name + ' has an unterminated function body');
}
const { getSubscriptionStatus, getCurrentUsage } = vm.runInNewContext(
  extract('getSubscriptionStatus') + '\n' + extract('getCurrentUsage') + '\n({ getSubscriptionStatus, getCurrentUsage })'
);
for (const tenant of ['tenant-one', 'tenant-two', '']) {
  test('legacy billing cannot provide fabricated entitlement or usage for ' + JSON.stringify(tenant), async () => {
    await assert.rejects(getSubscriptionStatus(tenant), /Legacy Studio billing adapter is disabled/);
    await assert.rejects(getCurrentUsage(tenant), /Legacy Studio billing adapter is disabled/);
  });
}
