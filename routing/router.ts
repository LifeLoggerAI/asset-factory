function selectCloud(regionMetrics) {

  const healthy = regionMetrics.filter(r => r.status === "healthy");

  healthy.sort((a, b) =>
    (a.latency + a.load) - (b.latency + b.load)
  );

  return healthy[0].cloud;
}