export async function revenueOptimizer(tenantId: string) {

  const metrics = await calculateTenantMargin(tenantId);

  if (metrics.grossMargin < 0.35) {
    await suggestTierUpgrade(tenantId);
  }

  if (metrics.grossMargin > 0.75) {
    await considerPriceOptimization(tenantId);
  }
}