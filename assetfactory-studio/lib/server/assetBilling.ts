import { getAdminDb } from './firebaseAdmin';
import { listUsageEvents } from './assetFactoryStore';
import type { CanonicalAssetType } from './assetFactoryTypes';

type UsageEvent = Record<string, unknown> & {
  action?: string;
  tenantId?: string;
  assetType?: CanonicalAssetType;
  estimatedUnits?: number;
  estimatedCostCents?: number;
  createdAt?: string;
};

export type TenantQuota = {
  maxMonthlyUnits: number;
  maxMonthlyCostCents: number;
  maxMonthlyJobs: number;
  source: 'env' | 'firestore-plan' | 'stripe-webhook' | 'stripe-price-metadata';
  status?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripePriceId?: string;
};

export type TenantQuotaDecision = {
  ok: boolean;
  error?: string;
  quota: TenantQuota;
  current: { jobs: number; units: number; costCents: number };
  next: { jobs: number; units: number; costCents: number };
};

const ALLOWED_BILLING_STATUSES = new Set(['active', 'trialing']);

function envNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function numberValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function recordValue(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

export function defaultTenantQuota(): TenantQuota {
  return {
    maxMonthlyJobs: envNumber('ASSET_FACTORY_MAX_MONTHLY_JOBS', 500),
    maxMonthlyUnits: envNumber('ASSET_FACTORY_MAX_MONTHLY_UNITS', 5000),
    maxMonthlyCostCents: envNumber('ASSET_FACTORY_MAX_MONTHLY_COST_CENTS', 10000),
    source: 'env',
    status: 'active',
  };
}

function firstPositiveNumber(...values: unknown[]) {
  for (const value of values) {
    const parsed = numberValue(value);
    if (parsed > 0) return parsed;
  }
  return undefined;
}

function quotaFromMetadata(metadata: Record<string, unknown> | undefined, fallback: TenantQuota, source: TenantQuota['source']): TenantQuota {
  if (!metadata) return fallback;
  return {
    maxMonthlyJobs: firstPositiveNumber(metadata.assetFactoryMaxMonthlyJobs, metadata.maxMonthlyJobs) ?? fallback.maxMonthlyJobs,
    maxMonthlyUnits: firstPositiveNumber(metadata.assetFactoryMaxMonthlyUnits, metadata.maxMonthlyUnits) ?? fallback.maxMonthlyUnits,
    maxMonthlyCostCents: firstPositiveNumber(metadata.assetFactoryMaxMonthlyCostCents, metadata.maxMonthlyCostCents) ?? fallback.maxMonthlyCostCents,
    source,
    status: stringValue(metadata.status) ?? fallback.status,
    stripeCustomerId: stringValue(metadata.stripeCustomerId) ?? fallback.stripeCustomerId,
    stripeSubscriptionId: stringValue(metadata.stripeSubscriptionId) ?? fallback.stripeSubscriptionId,
    stripePriceId: stringValue(metadata.stripePriceId) ?? fallback.stripePriceId,
  };
}

async function readTenantRecord(tenantId: string) {
  const db = getAdminDb();
  if (!db) return null;
  const doc = await db.collection('tenants').doc(tenantId).get();
  return doc.exists ? doc.data() ?? null : null;
}

async function quotaFromStripe(tenantId: string, fallback: TenantQuota): Promise<TenantQuota> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey || process.env.ASSET_FACTORY_STRIPE_LIVE_QUOTA_LOOKUP !== 'true') return fallback;

  const tenant = await readTenantRecord(tenantId) as Record<string, unknown> | null;
  const stripeCustomerId = stringValue(tenant?.stripeCustomerId);
  const stripeSubscriptionId = stringValue(tenant?.stripeSubscriptionId);
  if (!stripeCustomerId && !stripeSubscriptionId) return fallback;

  const stripe = await import('stripe');
  const client = new stripe.default(secretKey);
  const subscription = stripeSubscriptionId
    ? await client.subscriptions.retrieve(stripeSubscriptionId, { expand: ['items.data.price'] })
    : (await client.subscriptions.list({ customer: stripeCustomerId, status: 'active', limit: 1, expand: ['data.items.data.price'] })).data[0];

  const price = subscription?.items?.data?.[0]?.price;
  const metadata = price?.metadata as Record<string, unknown> | undefined;
  return quotaFromMetadata(metadata, {
    ...fallback,
    status: subscription?.status ?? fallback.status,
    stripeCustomerId,
    stripeSubscriptionId: subscription?.id ?? stripeSubscriptionId,
    stripePriceId: price?.id,
  }, 'stripe-price-metadata');
}

function quotaFromPersistedTenant(tenant: Record<string, unknown> | null, fallback: TenantQuota): TenantQuota {
  if (!tenant) return fallback;

  const plan = recordValue(tenant.assetFactoryPlan);
  const entitlement = recordValue(tenant.assetFactoryEntitlement);
  const withPlan = quotaFromMetadata(plan, fallback, plan?.source === 'stripe-webhook' ? 'stripe-webhook' : 'firestore-plan');

  return quotaFromMetadata(entitlement, {
    ...withPlan,
    status: stringValue(entitlement?.status) ?? withPlan.status,
    stripeCustomerId: stringValue(entitlement?.stripeCustomerId) ?? stringValue(tenant.stripeCustomerId) ?? withPlan.stripeCustomerId,
    stripeSubscriptionId: stringValue(entitlement?.stripeSubscriptionId) ?? stringValue(tenant.stripeSubscriptionId) ?? withPlan.stripeSubscriptionId,
    stripePriceId: stringValue(entitlement?.stripePriceId) ?? withPlan.stripePriceId,
  }, entitlement ? 'stripe-webhook' : withPlan.source);
}

export async function getTenantQuota(tenantId = 'default'): Promise<TenantQuota> {
  const fallback = defaultTenantQuota();
  const tenant = await readTenantRecord(tenantId) as Record<string, unknown> | null;
  const persistedQuota = quotaFromPersistedTenant(tenant, fallback);
  return quotaFromStripe(tenantId, persistedQuota);
}

function startOfMonth(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString();
}

function quotaStatusAllowed(quota: TenantQuota) {
  if (process.env.ASSET_FACTORY_REQUIRE_ACTIVE_ENTITLEMENT !== 'true') return true;
  return ALLOWED_BILLING_STATUSES.has(String(quota.status ?? '').toLowerCase());
}

export async function evaluateTenantQuota(input: {
  tenantId: string;
  estimatedUnits: number;
  estimatedCostCents: number;
}): Promise<TenantQuotaDecision> {
  const quota = await getTenantQuota(input.tenantId);
  const since = startOfMonth();
  const events = (await listUsageEvents()) as UsageEvent[];
  const tenantEvents = events.filter((event) => event.tenantId === input.tenantId && String(event.createdAt ?? '') >= since);
  const current = {
    jobs: tenantEvents.filter((event) => event.action === 'job.created').length,
    units: tenantEvents.reduce((sum, event) => sum + numberValue(event.estimatedUnits), 0),
    costCents: tenantEvents.reduce((sum, event) => sum + numberValue(event.estimatedCostCents), 0),
  };
  const next = { jobs: current.jobs + 1, units: current.units + input.estimatedUnits, costCents: current.costCents + input.estimatedCostCents };

  if (!quotaStatusAllowed(quota)) return { ok: false, error: `tenant entitlement is not active (${quota.status ?? 'unknown'})`, quota, current, next };
  if (next.jobs > quota.maxMonthlyJobs) return { ok: false, error: `tenant monthly job quota exceeded (${quota.maxMonthlyJobs})`, quota, current, next };
  if (next.units > quota.maxMonthlyUnits) return { ok: false, error: `tenant monthly unit quota exceeded (${quota.maxMonthlyUnits})`, quota, current, next };
  if (next.costCents > quota.maxMonthlyCostCents) return { ok: false, error: `tenant monthly cost quota exceeded (${quota.maxMonthlyCostCents} cents)`, quota, current, next };
  return { ok: true, quota, current, next };
}
