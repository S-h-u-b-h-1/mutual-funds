// Premium feature-flag architecture (Phase 8 — Investor Operating System sprint). Scaffolding
// only: every flag defaults OFF and nothing here is charged or gated behind payment yet. The
// point is to have a single, real switch per candidate premium feature ready to flip on later,
// rather than hardcoding "is this premium" checks ad-hoc across the app when that day comes.
//
// A flag can be forced on for local/staging testing via env var (NEXT_PUBLIC_FLAG_<KEY>=true),
// but with no env var set every flag is off — the default is always the free, current behavior.
const CANDIDATES = {
  dailyAiBrief: "Daily AI Brief",
  portfolioAnalyzer: "Portfolio Analyzer",
  advancedScreener: "Advanced Screener",
  historicalSimulator: "Historical Simulator",
  rollingReturnExplorer: "Rolling Return Explorer",
  managerAnalytics: "Manager Analytics",
  portfolioOverlap: "Portfolio Overlap",
  holdingsExplorer: "Holdings Explorer",
  marketAlerts: "Market Alerts",
  smsWhatsappAlerts: "SMS / WhatsApp Alerts",
  advisorChat: "Advisor Chat",
  researchReports: "Research Reports",
  apiAccess: "API Access",
};

function envKey(flag) {
  return `NEXT_PUBLIC_FLAG_${flag.replace(/([A-Z])/g, "_$1").toUpperCase()}`;
}

export function isEnabled(flag) {
  if (!(flag in CANDIDATES)) return false;
  return process.env[envKey(flag)] === "true";
}

export function allFlags() {
  return Object.keys(CANDIDATES).map((key) => ({ key, label: CANDIDATES[key], enabled: isEnabled(key) }));
}
