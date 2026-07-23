// Adapts a circuit breaker's getMetrics() (which reports `state`: closed/open/half_open) into
// the shape platform/providerRegistry/core.js's runProviderConformanceCheck requires (a
// `status` field) — the breaker framework and the Provider Registry were built in separate
// Phase 4.5 steps and never had a consumer wiring them together until these mock channels,
// which is when this gap surfaced. Keeps every original metrics field (state/sampleSize/
// totalTrips/...) alongside the added `status`, so getPlatformProviderSummary's existing
// breaker-aware check (`health?.state` open/half_open) still works unchanged.
const STATE_TO_STATUS = { closed: "healthy", half_open: "degraded", open: "unhealthy" };

export function breakerHealth(breaker) {
  const metrics = breaker.getMetrics();
  return { status: STATE_TO_STATUS[metrics.state] ?? "unknown", ...metrics };
}
