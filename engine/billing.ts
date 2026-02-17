import { User, Job } from './schema';
import { audit } from './logger';

export enum Plan {
    FREE = 'free',
    BASIC = 'basic',
    PRO = 'pro',
    AGENCY = 'agency',
    ENTERPRISE = 'enterprise',
}

const PLAN_LIMITS: Record<Plan, { jobs_per_month: number }> = {
    [Plan.FREE]: { jobs_per_month: 10 },
    [Plan.BASIC]: { jobs_per_month: 200 },
    [Plan.PRO]: { jobs_per_month: 1000 },
    [Plan.AGENCY]: { jobs_per_month: 5000 },
    [Plan.ENTERPRISE]: { jobs_per_month: Infinity }, // Enterprise plans have custom limits, managed separately
};

// In a real system, this would query a database to get the job count for the current month.
const monthly_job_counts = new Map<string, number>();

export function check_plan_entitlement(user: User, job_input: any): { entitled: boolean; reason?: string } {
    const plan = (user as any).plan || Plan.FREE; // Default to free plan if not specified
    const limit = PLAN_LIMITS[plan].jobs_per_month;
    const current_count = monthly_job_counts.get(user.id) || 0;

    if (current_count >= limit) {
        audit({ id: 'N/A', userId: user.id } as Job, 'BillingLimitExceeded', { plan, limit, current_count });
        return { entitled: false, reason: `Monthly job limit of ${limit} exceeded for plan: ${plan}` };
    }

    return { entitled: true };
}

export function increment_usage(user: User): void {
    const current_count = monthly_job_counts.get(user.id) || 0;
    monthly_job_counts.set(user.id, current_count + 1);
    audit({ id: 'N/A', userId: user.id } as Job, 'UsageIncremented', { new_count: current_count + 1 });
}
