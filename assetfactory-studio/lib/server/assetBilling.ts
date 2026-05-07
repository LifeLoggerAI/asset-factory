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
  source: 'env' | 'firestore-plan' | 'stripe-price-metadata';
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

function envNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

export function defaultTenantQuota(): TenantQuota {
  return {
    maxMonthlyJobs: envNumber('ASSET_FACTORY_MAX_MONTHLY_JOBS', 500),
    maxMonthlyUnits: envNumber('ASSET_FACTORY_MAX_MONTHLY_UNITS', 5000),
    maxMonthlyCostCents: envNumber('ASSET_FACTORY_MAX_MONTHLY_COST_CENTS', 10000),
    source: 'env',
  };
}

function quotaFromMetadata(metadata: Record<string, unknown> | undefined, fallback: TenantQuota, source: TenantQuota['source']): TenantQuota {
  if (!metadata) return fallback;
  return {
    maxMonthlyJobs: numberValue(metadata.assetFactoryMaxMonthlyJobs) || numberValue(metadata.maxMonthlyJobs) || fallback.maxMonthlyJobs,
    maxMonthlyUnits: numberValue(metadata.assetFactoryMaxMonthlyUnits) || numberValue(metadata.maxMonthlyUnits) || fallback.maxMonthlyUnits,
    maxMonthlyCostCents: numberValue(metadata.assetFactoryMaxMonthlyCostCents) || numberValue(metadata.maxMonthlyCostCents) || fallback.maxMonthlyCostCents,
    source,
    stripeCustomerId: fallback.stripeCustomerId,
    stripeSubscriptionId: fallback.stripeSubscriptionId,
    stripePriceId: fallback.stripePriceId,
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
  if (!secretKey) return fallback;

  const tenant = await readTenantRecord(tenantId) as Record<string, unknown> | null;
  const stripeCustomerId = stringValue(tenant?.stripeCustomerId);
  const stripeSubscriptionId = stringValue(tenant?.stripeSubscriptionId);
  if (!stripeCustomerId && !stripeSubscriptionId) return fallback;

  const stripe = await import('stripe');
  const client = new stripe.default(secretKey, { apiVersion: '2025-08-27.basil' });
  const subscription = stripeSubscriptionId
    ? await client.subscriptions.retrieve(stripeSubscriptionId, { expand: ['items.data.price'] })
    : (await client.subscriptions.list({ customer: stripeCustomerId, status: 'active', limit: 1, expand: ['data.items.data.price'] })).data[0];

  const price = subscription?.items?.data?.[0]?.price;
  const metadata = price?.metadata as Record<string, unknown> | undefined;
  return quotaFromMetadata(metadata, {
    ...fallback,
    stripeCustomerId,
    stripeSubscriptionId: subscription?.id ?? stripeSubscriptionId,
    stripePriceId: price?.id,
  }, 'stripe-price-metadata');
}

export async function getTenantQuota(tenantId = 'default'): Promise<TenantQuota> {
  const fallback = defaultTenantQuota();
  const tenant = await readTenantRecord(tenantId) as Record<string, unknown> | null;
  const plan = tenant?.assetFactoryPlan as Record<string, unknown> | undefined;
  const firestoreQuota = quotaFromMetadata(plan, fallback, plan ? 'firestore-plan' : fallback.source);
  return quotaFromStripe(tenantId, firestoreQuota);
}

function startOfMonth(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString();
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

  if (next.jobs > quota.maxMonthlyJobs) return { ok: false, error: `tenant monthly job quota exceeded (${quota.maxMonthlyJobs})`, quota, current, next };
  if (next.units > quota.maxMonthlyUnits) return { ok: false, error: `tenant monthly unit quota exceeded (${quota.maxMonthlyUnits})`, quota, current, next };
  if (next.costCents > quota.maxMonthlyCostCents) return { ok: false, error: `tenant monthly cost quota exceeded (${quota.maxMonthlyCostCents} cents)`, quota, current, next };
  return { ok: true, quota, current, next };
}
