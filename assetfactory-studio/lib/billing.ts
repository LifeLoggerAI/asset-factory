export async function getSubscriptionStatus(_tenantId: string){ return { status: 'active', tier: 'free' as const }; }
export async function getCurrentUsage(_tenantId: string){ return 0; }
