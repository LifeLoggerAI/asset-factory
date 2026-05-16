#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const checks = [
  {
    path: 'assetfactory-studio/lib/server/assetBilling.ts',
    required: [
      'ASSET_FACTORY_REQUIRE_ACTIVE_ENTITLEMENT',
      'ASSET_FACTORY_STRIPE_LIVE_QUOTA_LOOKUP',
      'assetFactoryEntitlement',
      'stripe-webhook',
      'quotaStatusAllowed',
      'tenant entitlement is not active',
      'numberValue(value: unknown)',
      'firstPositiveNumber',
    ],
  },
  {
    path: 'assetfactory-studio/lib/server/stripeEntitlements.ts',
    required: [
      'persistStripeEntitlement',
      'assetFactoryStripeEvents',
      'duplicate',
      'tenantPatch',
      'assetFactoryPlan',
      'assetFactoryEntitlement',
    ],
  },
  {
    path: 'assetfactory-studio/app/api/stripe/webhooks/route.ts',
    required: [
      'verifyStripeSignature',
      'timingSafeEqual',
      'STRIPE_WEBHOOK_SECRET',
      'persistStripeEntitlement',
      'entitlementApplied',
      'entitlementDuplicate',
    ],
  },
  {
    path: 'assetfactory-studio/app/api/generate/route.ts',
    required: [
      'evaluateTenantQuota',
      'estimatedUnits',
      'estimatedCostCents',
      'status: 402',
    ],
  },
];

const failures = [];
for (const check of checks) {
  const absolute = path.join(root, check.path);
  if (!fs.existsSync(absolute)) {
    failures.push(`${check.path}: missing file`);
    continue;
  }
  const source = fs.readFileSync(absolute, 'utf8');
  for (const needle of check.required) {
    if (!source.includes(needle)) failures.push(`${check.path}: missing ${needle}`);
  }
}

if (failures.length > 0) {
  console.error('FAIL billing entitlement checks');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('PASS billing entitlement checks');
