"use client";

import { useMemo, useState } from "react";
import InvestShell, { ButtonLink, Card, StatusPill } from "./InvestShell";

const queues = [
  ["Investment-ready clients", "Awaiting advisor API", "ready"],
  ["KYC and compliance", "Awaiting advisor API", "pending"],
  ["Transactions needing review", "Awaiting operations API", "processing"],
  ["Follow-ups due", "Awaiting CRM API", "pending"],
];

const requirements = [
  "Client roster with household relationships and permission scope",
  "Readiness, portfolio summary, active SIP and transaction rollups",
  "Document visibility and advisor-sharing permissions",
  "Tasks, notes, communication history and meeting events",
  "Server-side search, pagination and audit references",
];

export default function AdvisorWorkspace() {
  const [query, setQuery] = useState("");
  const visibleRequirements = useMemo(() => requirements.filter(item => item.toLowerCase().includes(query.trim().toLowerCase())), [query]);
  return <InvestShell title="Advisor workspace, with context." description="A focused workspace for client health, readiness and follow-up. Client data will appear only through the documented advisor permissions contract." actions={<ButtonLink href="/advisor" secondary>Open public advisor desk</ButtonLink>}>
    <Card className="mb-5 border-information/25 bg-information/5 p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="text-[10px] font-bold uppercase tracking-[.16em] text-information">Contract-aware preview</div><h2 className="mt-2 text-lg font-semibold text-ink">The workspace shell is ready for Claude’s advisor APIs.</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-ink-muted">No client names, balances or statuses are fabricated here. Once advisor permissions and CRM endpoints land, this screen can consume them without changing the interaction model.</p></div><StatusPill status="pending" /></div></Card>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{queues.map(([label, detail, status]) => <Card key={label} className="p-5"><div className="flex items-start justify-between gap-3"><div className="text-sm font-semibold text-ink">{label}</div><StatusPill status={status} /></div><div className="mt-5 text-xs text-ink-faint">{detail}</div><div className="mt-3 h-2 rounded-full bg-surface-2" aria-hidden="true" /></Card>)}</div>
    <div className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_.8fr]"><Card className="p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-ink">Client list</h2><p className="mt-1 text-xs text-ink-faint">Search and pagination will be server-backed.</p></div><button type="button" disabled className="min-h-10 rounded-full border border-line px-4 text-xs font-semibold text-ink disabled:opacity-50">Add task</button></div><label className="mt-5 block"><span className="sr-only">Search clients</span><input value={query} onChange={event => setQuery(event.target.value)} className="min-h-11 w-full rounded-2xl border border-line bg-bg px-4 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/15" placeholder="Search clients when the advisor API is connected…" /></label><div className="mt-5 rounded-2xl bg-surface-2 p-5 text-sm leading-6 text-ink-muted">No client records are shown until the server confirms the advisor’s permission scope and returns a paginated roster.</div></Card><Card className="p-5 sm:p-6"><h2 className="font-semibold text-ink">Client health signals</h2><div className="mt-4 grid gap-3">{["Readiness completion", "Portfolio review due", "SIP or mandate issue", "Recent communication"].map(label => <div key={label} className="flex items-center justify-between gap-3 rounded-2xl border border-line p-4"><span className="text-sm text-ink-muted">{label}</span><span className="text-xs text-ink-faint">Awaiting data</span></div>)}</div></Card></div>
    <Card className="mt-5 p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-ink">Integration checklist</h2><p className="mt-1 text-xs text-ink-faint">Tracked in FRONTEND_CONTRACT_GAPS.md</p></div><span className="text-xs font-semibold text-accent">{visibleRequirements.length} requirements</span></div><ul className="mt-5 grid gap-3 sm:grid-cols-2">{visibleRequirements.map(item => <li key={item} className="rounded-2xl bg-surface-2 p-4 text-sm leading-6 text-ink-muted">{item}</li>)}</ul></Card>
  </InvestShell>;
}
