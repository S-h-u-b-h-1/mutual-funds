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

export function LoadingSkeleton({ label = "Loading", className = "h-28" }) {
  return <div className={`skeleton rounded-[1.5rem] ${className}`} role="status" aria-label={label} aria-busy="true" />;
}

export function EmptyState({ title, detail, action = null }) {
  return <Card className="grid min-h-64 place-items-center p-7 text-center"><div className="max-w-md"><h2 className="text-lg font-semibold text-ink">{title}</h2><p className="mt-2 text-sm leading-6 text-ink-muted">{detail}</p>{action && <div className="mt-5">{action}</div>}</div></Card>;
}

export function ErrorState({ title = "This view did not load", detail, onRetry }) {
  return <Card className="border-neg/25 bg-neg/5 p-6" role="alert"><h2 className="font-semibold text-ink">{title}</h2><p className="mt-2 text-sm leading-6 text-ink-muted">{detail}</p>{onRetry && <button type="button" onClick={onRetry} className="mt-4 min-h-11 rounded-full bg-ink px-5 text-sm font-semibold text-bg">Try again</button>}</Card>;
}

export function SectionHeader({ title, description, action = null }) {
  return <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-semibold text-ink">{title}</h2>{description && <p className="mt-1 text-xs text-ink-faint">{description}</p>}</div>{action}</div>;
}
