"use client";

import { Card, StatusPill } from "./InvestShell";

export function AwaitingData({ detail = "This value will appear when the server contract supplies it." }) {
  return <span className="text-xs text-ink-faint" title={detail}>Awaiting backend data</span>;
}

export function KpiCard({ label, value = "Awaiting data", detail = "Drill-down unavailable", status }) {
  return <Card className="p-5"><div className="flex items-start justify-between gap-3"><div className="text-xs text-ink-faint">{label}</div>{status && <StatusPill status={status} />}</div><div className="mt-3 break-words text-2xl font-semibold text-ink">{value}</div><div className="mt-3 text-xs text-ink-faint">{detail}</div></Card>;
}

export function QueueCard({ label, status = "pending", detail = "Awaiting backend queue data" }) {
  return <Card className="p-5"><div className="flex items-start justify-between gap-3"><h2 className="text-sm font-semibold text-ink">{label}</h2><StatusPill status={status} /></div><p className="mt-4 text-xs leading-5 text-ink-faint">{detail}</p><div className="mt-4 h-2 rounded-full bg-surface-2" aria-hidden="true" /></Card>;
}
