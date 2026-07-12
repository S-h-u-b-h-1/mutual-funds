// News-feed freshness (Phase 1 extension): honest "is the news feed live" signal derived from
// the real news_ingestion_runs audit log — never a fabricated "live" badge. Mirrors the
// green/amber/red vocabulary in marketStatus.js so the two freshness indicators read consistently.
// news_ingest.yml runs every 15 minutes ("*/15 * * * *"), not every 3 hours — this file
// previously assumed the older 3-hourly schedule (LIVE_MAX_HOURS=6, "2 missed runs"), which on
// the real 15-minute cadence is ~24 missed runs: a genuine multi-hour ingestion outage would have
// shown as "News feed live" for most of its duration, with no disclosure. 1 hour = 4 missed runs
// on the real schedule, enough buffer to absorb one slow/delayed run without false "stale" flaps.
const LIVE_MAX_HOURS = 1;
const IST_OFFSET_MIN = 330;

function toIST(d) {
  return new Date(d.getTime() + IST_OFFSET_MIN * 60000);
}

// Next scheduled ingestion: cron "*/15 * * * *" UTC — every 15 minutes, all days (RBI/SEBI/global
// cues aren't confined to NSE trading hours, so news ingestion isn't either).
function nextScheduledRun(now) {
  const next = new Date(now);
  next.setUTCSeconds(0, 0);
  next.setUTCMinutes(Math.ceil((next.getUTCMinutes() + 1) / 15) * 15);
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
