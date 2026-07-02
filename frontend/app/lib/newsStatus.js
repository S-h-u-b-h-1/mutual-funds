// News-feed freshness (Phase 1 extension): honest "is the news feed live" signal derived from
// the real news_ingestion_runs audit log — never a fabricated "live" badge. Mirrors the
// green/amber/red vocabulary in marketStatus.js so the two freshness indicators read consistently.
const LIVE_MAX_HOURS = 6; // news_ingest.yml runs every 3h — 2 missed runs = flag as stale, not "live"
const IST_OFFSET_MIN = 330;

function toIST(d) {
  return new Date(d.getTime() + IST_OFFSET_MIN * 60000);
}

// Next scheduled ingestion: cron "20 */3 * * *" UTC — every 3 hours, all days (RBI/SEBI/global
// cues aren't confined to NSE trading hours, so news ingestion isn't either).
function nextScheduledRun(now) {
  const next = new Date(now);
  next.setUTCMinutes(20, 0, 0);
  while (next.getUTCHours() % 3 !== 0 || next <= now) {
    next.setUTCHours(next.getUTCHours() + 1);
    next.setUTCMinutes(20, 0, 0);
  }
  return next;
}

export function newsStatus(runs, now = new Date()) {
  const lastSuccess = (runs || []).find((r) => r.status === "success");
  const lastAny = (runs || [])[0];
  const hoursSince = lastSuccess ? (now - new Date(lastSuccess.finished_at)) / 3600000 : null;
  const isLive = hoursSince != null && hoursSince <= LIVE_MAX_HOURS;
  const tone = isLive ? "pos" : lastSuccess ? "warn" : "neg";

  let label;
  if (!lastAny) label = "News feed not yet running — no ingestion runs recorded.";
  else if (isLive) label = `News feed live — last updated ${Math.round(hoursSince * 10) / 10}h ago`;
  else if (lastSuccess) label = `News feed delayed — last successful update ${Math.round(hoursSince)}h ago`;
  else label = "News feed not yet running — no successful ingestion recorded.";

  const next = nextScheduledRun(now);
  const nextLabel = `Next check: ${next.toLocaleTimeString("en-IN", { timeZone: "UTC", hour: "2-digit", minute: "2-digit" })} UTC (~${new Date(next.getTime() + IST_OFFSET_MIN * 60000).toLocaleTimeString("en-IN", { timeZone: "UTC", hour: "2-digit", minute: "2-digit" })} IST)`;

  return { isLive, tone, label, nextLabel, lastSuccessAt: lastSuccess?.finished_at || null, totalRuns: (runs || []).length };
}
