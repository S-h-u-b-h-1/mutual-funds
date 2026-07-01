// Real-time-experience primitives (Phase 3): honest freshness + market-session facts, computed
// server-side from the bundled asOf date and the actual clock — never a fabricated "live" claim.
// Mirrors the green/amber/red thresholds in ingestion/freshness.py (GREEN_MAX=2, AMBER_MAX=7).
const GREEN_MAX = 2, AMBER_MAX = 7;
const IST_OFFSET_MIN = 330; // UTC+5:30, no DST

function toIST(d) {
  return new Date(d.getTime() + IST_OFFSET_MIN * 60000);
}

export function freshnessTone(staleDays) {
  if (staleDays == null) return "neg";
  if (staleDays <= GREEN_MAX) return "pos";
  if (staleDays <= AMBER_MAX) return "warn";
  return "neg";
}

// Next scheduled ingestion: cron "30 14 * * 1-6" UTC = 20:00 IST, Mon-Sat.
function nextScheduledRun(now) {
  const ist = toIST(now);
  const cursor = new Date(ist);
  for (let i = 0; i < 8; i++) {
    const day = cursor.getUTCDay(); // getUTCDay on an IST-shifted Date acts as IST weekday
    const isRunDay = day >= 1 && day <= 6;
    const atOrBefore2000 = cursor.getUTCHours() < 20 || (cursor.getUTCHours() === 20 && cursor.getUTCMinutes() === 0 && i === 0);
    if (isRunDay && (i > 0 || atOrBefore2000)) {
      // true UTC epoch for 20:00 IST on this (IST-calendar) date = 14:30 UTC, same day (no
      // rollover, since 14:30 < 24:00 and 14:30+5:30=20:00 < 24:00) — matches the cron literally.
      const runDate = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate(), 14, 30, 0));
      return runDate;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    cursor.setUTCHours(0, 0, 0, 0);
  }
  return null;
}

// Market status is derived ONLY from clock facts we can actually verify (weekday + NSE trading
// window, IST). We do NOT claim to know the NSE/BSE holiday calendar, so a weekday is labelled
// "exchange hours" rather than an unconditional "market open" — honest about what we don't know.
export function marketStatus(asOfIso, now = new Date()) {
  const ist = toIST(now);
  const day = ist.getUTCDay();
  const hh = ist.getUTCHours(), mm = ist.getUTCMinutes();
  const isWeekend = day === 0 || day === 6;
  const minutesNow = hh * 60 + mm;
  const inTradingWindow = !isWeekend && minutesNow >= 9 * 60 + 15 && minutesNow <= 15 * 60 + 30;

  const asOfParsed = asOfIso ? new Date(`${asOfIso}T00:00:00Z`) : null;
  const asOf = asOfParsed && !isNaN(asOfParsed) ? asOfParsed : null; // guard malformed dates -> never render "NaNd ago"
  const todayIst = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
  const staleDays = asOf ? Math.round((todayIst - asOf) / 86400000) : null;

  let sessionLabel;
  if (isWeekend) sessionLabel = "Market closed (weekend)";
  else if (inTradingWindow) sessionLabel = "Exchange hours (9:15–15:30 IST)";
  else sessionLabel = "Outside exchange hours";

  const prettyDate = asOf ? new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate()))
    .toLocaleDateString("en-IN", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }) : null;

  let navLine;
  if (staleDays == null) navLine = "NAV date unavailable";
  else if (staleDays === 0) navLine = `Latest NAV: today (${asOfIso})`;
  else if (staleDays === 1) {
    // Honest for both cases: a weekday still waiting for today's evening AMFI publish, or a
    // weekend/holiday where none is expected — the fact is the same either way, so say it plainly.
    navLine = `No fresh NAV has been published yet today. Latest available AMFI NAV date: ${prettyDate}.` + (isWeekend ? " Market closed." : "");
  } else navLine = `Latest NAV: ${asOfIso} (${staleDays}d ago)`;

  const next = nextScheduledRun(now);
  const nextLabel = next
    ? `Next update: ${next.toLocaleDateString("en-IN", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" })}, ~20:00 IST`
    : null;

  return { staleDays, tone: freshnessTone(staleDays), sessionLabel, navLine, nextLabel, isWeekend, inTradingWindow };
}
