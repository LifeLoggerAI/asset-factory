// The preserved Studio V4 billing shim has no real entitlement or usage source.
// It must never grant every caller an active free tier or report zero usage.
// Canonical Studio routes use their own authenticated billing/tenant guards.
type LegacySubscription = {
    status: 'active' | 'inactive';
    tier: 'free' | 'pro' | 'enterprise';
};

export async function getSubscriptionStatus(_tenantId: string): Promise<LegacySubscription> {
    throw new Error('Legacy Studio billing adapter is disabled: no authenticated entitlement source.');
}

export async function getCurrentUsage(_tenantId: string): Promise<number> {
    throw new Error('Legacy Studio billing adapter is disabled: no authoritative usage meter.');
}
