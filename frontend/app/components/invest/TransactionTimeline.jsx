"use client";

import { Card, StatusPill } from "./InvestShell";
import { orderStatusMeta } from "../../lib/invest/transactionStatus";
import SchemeName from "./SchemeName";

function formatDate(value) {
  return value ? new Date(value).toLocaleString("en-IN") : "Timestamp unavailable";
}

export default function TransactionTimeline({ events = [], currentStatus, reference, amount, units, scheme, nextStep, actionRequired, supportHref = "/invest/advisor" }) {
  const current = orderStatusMeta(currentStatus);
  return <Card className="p-5" aria-label="Transaction timeline">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="text-[10px] font-bold uppercase tracking-[.16em] text-accent">Transaction timeline</div><h2 className="mt-2 text-lg font-semibold text-ink">{current[0]}</h2>{reference && <p className="mt-1 break-all text-xs text-ink-faint">Reference · {reference}</p>}</div>
      <StatusPill status={currentStatus} />
    </div>
    {(scheme || amount != null || units != null) && <dl className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-surface-2 p-4 text-xs sm:grid-cols-4">{scheme && <div><dt className="text-ink-faint">Scheme</dt><dd className="mt-1 font-semibold text-ink"><SchemeName code={scheme} /></dd></div>}{amount != null && <div><dt className="text-ink-faint">Amount</dt><dd className="mt-1 font-semibold text-ink">₹{Number(amount).toLocaleString("en-IN")}</dd></div>}{units != null && <div><dt className="text-ink-faint">Units</dt><dd className="mt-1 font-semibold text-ink">{units}</dd></div>}{nextStep && <div><dt className="text-ink-faint">Next step</dt><dd className="mt-1 font-semibold text-ink">{nextStep}</dd></div>}</dl>}
    {actionRequired && <p className="mt-4 rounded-2xl bg-warn/10 p-3 text-xs leading-5 text-warn"><strong>Action required:</strong> {actionRequired}</p>}
    {events.length ? <ol className="mt-5 grid gap-0">{events.map((event, index) => { const meta = orderStatusMeta(event.to_status); return <li key={(event.to_status || "event") + "-" + (event.created_at || index)} className="flex gap-3"><div className="flex flex-col items-center"><span className="grid h-7 w-7 place-items-center rounded-full bg-accent/10 text-xs font-bold text-accent">{index + 1}</span>{index < events.length - 1 && <span className="h-8 w-px bg-line" />}</div><div className="pb-4"><div className="text-sm font-semibold text-ink">{meta[0]}</div><div className="mt-1 text-xs text-ink-faint">{formatDate(event.created_at)}</div>{event.reason && <div className="mt-1 text-xs text-neg">{event.reason}</div>}</div></li>; })}</ol> : <p className="mt-5 rounded-2xl bg-surface-2 p-4 text-sm text-ink-muted">No provider timeline is available for this state yet.</p>}
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-xs text-ink-muted"><span>{current[1]}</span><a href={supportHref} className="font-semibold text-accent">Need help? Contact Suasion →</a></div>
  </Card>;
}
