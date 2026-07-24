"use client";

import { useMemo, useState } from "react";
import InvestShell, { ButtonLink, Card } from "./InvestShell";
import { KpiCard, QueueCard } from "./PlatformPrimitives";

const operationQueues = ["KYC exceptions", "Mandate failures", "Payment failures", "Pending allotments", "Reconciliation exceptions", "Document verification", "Notification failures"];
const managementMetrics = ["Total AUM", "Active AUM", "Net inflows", "Gross purchases", "Gross redemptions", "Active SIP book", "Investor growth", "Operational health"];

function EmptyTable({ title, detail }) {
  return <Card className="grid min-h-64 place-items-center p-7 text-center"><div><h2 className="text-lg font-semibold text-ink">{title}</h2><p className="mt-2 max-w-lg text-sm leading-6 text-ink-muted">{detail}</p></div></Card>;
}

export function OperationsConsole() {
  const [query, setQuery] = useState("");
  const visible = useMemo(() => operationQueues.filter(item => item.toLowerCase().includes(query.toLowerCase())), [query]);
  return <InvestShell title="Operations, without guesswork." description="A queue-first console for exceptions, provider health and resolution work. Actions remain disabled until operational contracts define permissions and state transitions." actions={<ButtonLink href="/advisor/workspace" secondary>Advisor workspace</ButtonLink>}>
    <Card className="mb-5 border-information/25 bg-information/5 p-5"><div className="text-[10px] font-bold uppercase tracking-[.16em] text-information">Contract-aware console</div><h2 className="mt-2 text-lg font-semibold text-ink">Operational queues are ready for real exception data.</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-ink-muted">No failures, counts or provider outcomes are fabricated. The console will consume Claude’s queue APIs when they publish stable filters, pagination, permissions and resolution actions.</p></Card>
    <label className="mb-5 block"><span className="sr-only">Search operational queues</span><input value={query} onChange={event => setQuery(event.target.value)} className="min-h-12 w-full rounded-2xl border border-line bg-surface px-4 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/15" placeholder="Search queues…" /></label>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{visible.map(queue => <QueueCard key={queue} label={queue} />)}</div>
    <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_320px]"><EmptyTable title="No operational records loaded" detail="A detail panel, status history and resolution actions will appear after the operations API is available." /><Card className="p-5"><h2 className="font-semibold text-ink">Provider health</h2><div className="mt-4 rounded-2xl bg-surface-2 p-4 text-sm text-ink-muted">Awaiting provider-health contract.</div></Card></div>
  </InvestShell>;
}

export function ManagementDashboard() {
  return <InvestShell title="Management, with evidence." description="Executive KPIs with drill-down paths reserved for authenticated management data. No decorative or fabricated numbers." actions={<ButtonLink href="/operations" secondary>Open operations</ButtonLink>}>
    <Card className="mb-5 border-information/25 bg-information/5 p-5"><div className="text-[10px] font-bold uppercase tracking-[.16em] text-information">Awaiting management API</div><h2 className="mt-2 text-lg font-semibold text-ink">The KPI layout is ready for server-derived metrics.</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-ink-muted">Every metric below will link to its underlying investor, scheme, advisor or operational records once the backend publishes the corresponding permission-scoped endpoints.</p></Card>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{managementMetrics.map(metric => <KpiCard key={metric} label={metric} />)}</div>
    <div className="mt-5 grid gap-5 lg:grid-cols-3"><Card className="p-5"><h2 className="font-semibold text-ink">AMC allocation</h2><p className="mt-4 text-sm text-ink-muted">Awaiting allocation series.</p></Card><Card className="p-5"><h2 className="font-semibold text-ink">Category allocation</h2><p className="mt-4 text-sm text-ink-muted">Awaiting allocation series.</p></Card><Card className="p-5"><h2 className="font-semibold text-ink">Advisor performance</h2><p className="mt-4 text-sm text-ink-muted">Awaiting advisor analytics.</p></Card></div>
  </InvestShell>;
}
