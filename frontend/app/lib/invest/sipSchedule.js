// H4 (docs/LAUNCH_BLOCKER_REPORT.md): pure date arithmetic for "is a SIP mandate's next
// installment due on this date" — split out from the job handler so it can be unit-tested
// without a database. All comparisons are calendar-date-only (UTC, no time-of-day), matching
// how sip_mandates.start_date/end_date are stored (`date`, not `timestamptz`).
//
// A mandate's installment day is fixed at its start_date's day-of-month (monthly/quarterly) or
// day-of-week (weekly) — there is no separate "billing day" column, matching how a real AMC SIP
// mandate works (the first debit date sets the recurring date). Monthly/quarterly clamp to the
// last day of a shorter month (e.g. a day-31 mandate fires on day 30 in April, day 28/29 in
// February) rather than skipping the month entirely or rolling into the next one.
//
// Date-only values (mandate.start_date/end_date) MUST arrive as "YYYY-MM-DD" strings, never a
// raw node-postgres `date` object — node-pg's default type parser builds that Date at LOCAL
// midnight of the intended calendar day, so reading it back via ANY single fixed getter (UTC or
// local) is only correct if this code happens to run in the same timezone the value was built
// in. Confirmed empirically: this process's local zone is UTC+5:30, and a mandate's real
// start_date came back one calendar day early through .getUTCDate() as a result. The caller
// (sipInstallments.js) casts start_date/end_date ::text in SQL specifically to avoid ever
// constructing that ambiguous Date in the first place. A genuine live `Date` (e.g. `new Date()`
// for "now") is still accepted and is always read as UTC, matching Postgres's own current_date
// (the DB session runs in UTC).
function toUTCDateOnly(value) {
  if (typeof value === "string") {
    const [y, m, d] = value.slice(0, 10).split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function lastDayOfUTCMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function isInstallmentDueOn(mandate, dateValue) {
  const today = toUTCDateOnly(dateValue);
  const start = toUTCDateOnly(mandate.start_date ?? mandate.startDate);
  if (today < start) return false;
  const endRaw = mandate.end_date ?? mandate.endDate;
  if (endRaw && today > toUTCDateOnly(endRaw)) return false;

  if (mandate.frequency === "weekly") {
    return today.getUTCDay() === start.getUTCDay();
  }

  const monthsPerInterval = mandate.frequency === "quarterly" ? 3 : 1; // 'monthly' (and any unrecognized value) defaults to monthly cadence
  const monthsSinceStart =
    (today.getUTCFullYear() - start.getUTCFullYear()) * 12 + (today.getUTCMonth() - start.getUTCMonth());
  if (monthsSinceStart < 0 || monthsSinceStart % monthsPerInterval !== 0) return false;

  const targetDay = start.getUTCDate();
  const lastDayOfTodayMonth = lastDayOfUTCMonth(today.getUTCFullYear(), today.getUTCMonth());
  const effectiveTargetDay = Math.min(targetDay, lastDayOfTodayMonth);
  return today.getUTCDate() === effectiveTargetDay;
}

export function dueDateKey(dateValue) {
  return toUTCDateOnly(dateValue).toISOString().slice(0, 10);
}
