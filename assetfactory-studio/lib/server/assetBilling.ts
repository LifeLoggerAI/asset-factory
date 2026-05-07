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
};

export type TenantQuotaDecision = {
  ok: boolean;
  error?: string;
  quota: TenantQuota;
  current: {
    jobs: number;
    units: number;
    costCents: number;
  };
  next: {
    jobs: number;
    units: number;
    costCents: number;
  };
};

function envNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function getTenantQuota(): TenantQuota {
  return {
    maxMonthlyJobs: envNumber('ASSET_FACTORY_MAX_MONTHLY_JOBS', 500),
    maxMonthlyUnits: envNumber('ASSET_FACTORY_MAX_MONTHLY_UNITS', 5000),
    maxMonthlyCostCents: envNumber('ASSET_FACTORY_MAX_MONTHLY_COST_CENTS', 10000),
  };
}

function startOfMonth(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString();
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export async function evaluateTenantQuota(input: {
  tenantId: string;
  estimatedUnits: number;
  estimatedCostCents: number;
}): Promise<TenantQuotaDecision> {
  const quota = getTenantQuota();
  const since = startOfMonth();
  const events = (await listUsageEvents()) as UsageEvent[];
  const tenantEvents = events.filter(
    (event) => event.tenantId === input.tenantId && String(event.createdAt ?? '') >= since
  );

  const current = {
    jobs: tenantEvents.filter((event) => event.action === 'job.created').length,
    units: tenantEvents.reduce((sum, event) => sum + numberValue(event.estimatedUnits), 0),
    costCents: tenantEvents.reduce((sum, event) => sum + numberValue(event.estimatedCostCents), 0),
  };

  const next = {
    jobs: current.jobs + 1,
    units: current.units + input.estimatedUnits,
    costCents: current.costCents + input.estimatedCostCents,
  };

  if (next.jobs > quota.maxMonthlyJobs) {
    return { ok: false, error: `tenant monthly job quota exceeded (${quota.maxMonthlyJobs})`, quota, current, next };
  }
  if (next.units > quota.maxMonthlyUnits) {
    return { ok: false, error: `tenant monthly unit quota exceeded (${quota.maxMonthlyUnits})`, quota, current, next };
  }
  if (next.costCents > quota.maxMonthlyCostCents) {
    return { ok: false, error: `tenant monthly cost quota exceeded (${quota.maxMonthlyCostCents} cents)`, quota, current, next };
  }

  return { ok: true, quota, current, next };
}
