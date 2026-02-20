export function simulateScenario({
  providerCost,
  usageVolume,
  revenuePerUnit,
  penaltyRate
}) {

  const projectedCost = providerCost * usageVolume;
  const projectedRevenue = revenuePerUnit * usageVolume;

  const penalty = projectedRevenue * penaltyRate;

  const projectedMargin =
    (projectedRevenue - projectedCost - penalty) / projectedRevenue;

  return {
    projectedCost,
    projectedRevenue,
    projectedMargin
  };
}