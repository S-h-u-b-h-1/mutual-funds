"use client";

import { useEffect, useState } from "react";

import InvestShell, { ButtonLink, Card, InvestIcon, StatusPill } from "./InvestShell";
import { ErrorCard, LoadingCards, useInvestData } from "./useInvestData";
import { documentsApi, investApi, portfolioApi, sipApi } from "../../lib/invest/api";

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export default function InvestDashboard() {
  const { data, loading, error, refresh } = useInvestData();
  const [summary, setSummary] = useState(null);
  const [summaryError, setSummaryError] = useState("");
  const [dashboardData, setDashboardData] = useState({ orders: [], sips: [], documents: [], notifications: null });
  useEffect(() => {
    Promise.allSettled([portfolioApi.getSummary(), investApi.getOrders(), sipApi.list(), documentsApi.list()]).then(([summaryResult, orders, sips, documents]) => {
      if (summaryResult.status === "fulfilled") setSummary(summaryResult.value.summary || summaryResult.value);
      else setSummaryError(summaryResult.reason?.message || "Portfolio summary unavailable.");
      setDashboardData({ orders: orders.status === "fulfilled" ? orders.value.orders || [] : [], sips: sips.status === "fulfilled" ? sips.value.sips || [] : [], documents: documents.status === "fulfilled" ? documents.value.documents || [] : [], notifications: null });
    });
  }, []);
  const readiness = data?.compliance;
  const ready = readiness?.overallStatus === "completed";
  const pendingOrders = dashboardData.orders.filter(order => !["completed", "failed", "cancelled", "reversed"].includes(order.status));
  const activeSips = dashboardData.sips.filter(sip => ["active", "verified", "completed"].includes(sip.mandate_status || sip.status));
  const unread = dashboardData.notifications == null ? null : dashboardData.notifications.filter(item => !(item.read ?? item.is_read ?? item.read_at)).length;
  return <InvestShell title="Your wealth, clearly." description="A calm view of what is invested, what needs attention, and what comes next." actions={<ButtonLink href={ready ? "/funds" : "/invest/onboarding"}>{ready ? "Explore investments" : "Continue setup"}</ButtonLink>}>
    {loading ? <LoadingCards /> : error ? <ErrorCard message={error} retry={refresh} /> : <>
      <Card className="relative overflow-hidden p-6 sm:p-8">
        <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-accent/10 blur-3xl" aria-hidden="true" />
        <div className="relative grid gap-8 xl:grid-cols-[1fr_340px] xl:items-end">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-ink-muted"><span className="h-2 w-2 rounded-full bg-pos" />Portfolio overview</div>
            <div className="mt-5 break-words text-[clamp(2.5rem,6vw,5rem)] font-semibold tracking-[-.07em] text-ink">{summary?.totalValue == null ? "Not available" : money.format(Number(summary.totalValue))}</div>
            <p className="mt-2 text-sm text-ink-muted">{summaryError || (summary?.totalValue == null ? "Current value will appear after a portfolio is connected" : "Current value · latest server valuation")}</p>
            <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {["Today", "Overall returns", "Net invested"].map((label) => <div key={label} className="rounded-2xl bg-surface-2 p-4"><div className="text-xs text-ink-faint">{label}</div><div className="mt-1 break-words text-lg font-semibold text-ink">{label === "Net invested" && summary?.investedValue != null ? money.format(Number(summary.investedValue)) : "Not available"}</div></div>)}
            </div>
          </div>
          <div className="rounded-[1.45rem] border border-line bg-bg/55 p-5">
            <div className="flex items-center justify-between"><div><div className="text-xs font-semibold text-ink">Investment readiness</div><div className="mt-1 text-xs text-ink-faint">{readiness?.completed || 0} of {readiness?.total || 9} checks complete</div></div><div className="text-2xl font-semibold text-ink">{readiness?.percent || 0}%</div></div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${readiness?.percent || 0}%` }} /></div>
            <div className="mt-4 flex items-center justify-between gap-3"><StatusPill status={readiness?.overallStatus} /><a href="/invest/compliance" className="text-xs font-semibold text-accent">Review steps →</a></div>
          </div>
        </div>
      </Card>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["Active SIP amount", activeSips.reduce((total, sip) => total + Number(sip.amount || 0), 0), "/invest/sips"], ["Pending transactions", pendingOrders.length, "/invest/transactions"], ["Documents", dashboardData.documents.length, "/invest/documents"], ["Unread notifications", unread == null ? "Not available" : unread, "/invest/notifications"]].map(([label, value, href]) => <a key={label} href={href} className="rounded-2xl border border-line bg-surface p-4 transition hover:border-accent/40"><div className="text-xs text-ink-faint">{label}</div><div className="mt-2 text-2xl font-semibold text-ink">{label === "Active SIP amount" ? money.format(value) : value}</div><div className="mt-2 text-xs font-semibold text-accent">View details →</div></a>)}</div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
        <div className="grid gap-5 sm:grid-cols-2">
          <Card className="p-5"><div className="flex items-center gap-3"><InvestIcon>◎</InvestIcon><div><h2 className="font-semibold text-ink">Asset allocation</h2><p className="text-xs text-ink-faint">After your first holding</p></div></div><div className="mt-8 flex items-center gap-5"><div className="grid h-24 w-24 place-items-center rounded-full border-[10px] border-line text-xs font-semibold text-ink-faint">No data</div><p className="text-sm leading-6 text-ink-muted">Equity, debt and hybrid allocation will appear here once a portfolio is connected.</p></div></Card>
          <Card className="p-5"><div className="flex items-center gap-3"><InvestIcon>⌁</InvestIcon><div><h2 className="font-semibold text-ink">Goal progress</h2><p className="text-xs text-ink-faint">Plans tied to purpose</p></div></div><div className="mt-8 rounded-2xl bg-surface-2 p-4 text-sm text-ink-muted">No goal created yet. Add a goal during onboarding to turn investing into a clear monthly plan.</div><a href="/invest/onboarding?step=preferences" className="mt-4 inline-block text-sm font-semibold text-accent">Set a goal →</a></Card>
          <Card className="p-5 sm:col-span-2"><div className="flex items-start justify-between gap-4"><div><div className="text-[10px] font-bold uppercase tracking-[.16em] text-accent">AI morning brief</div><h2 className="mt-2 text-xl font-semibold tracking-[-.03em] text-ink">Nothing urgent needs your attention.</h2></div><span className="rounded-full bg-accent/10 px-3 py-1 text-[10px] font-bold text-accent">AI commentary</span></div><p className="mt-3 max-w-2xl text-sm leading-6 text-ink-muted">Complete investment readiness and connect a portfolio to receive a factual morning summary. Generated commentary will always be labelled and linked to its source data.</p></Card>
        </div>
        <div className="grid gap-5">
          <Card className="p-5"><h2 className="font-semibold text-ink">Up next</h2><div className="mt-4 grid gap-3">{[["Complete readiness", `${readiness?.percent || 0}% complete`, "/invest/compliance"], ["Connect a portfolio", "Import or add holdings", "/invest/portfolio"], ["Meet your advisor", data?.rmAssignment?.advisor_name || "Request guidance", "/invest/advisor"]].map(([a,b,c], i)=><a href={c} key={a} className="flex min-h-16 items-center gap-3 rounded-2xl bg-surface-2 px-4"><span className="grid h-7 w-7 place-items-center rounded-full bg-surface text-xs font-bold text-accent">{i+1}</span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-ink">{a}</span><span className="block truncate text-xs text-ink-faint">{b}</span></span><span aria-hidden="true">→</span></a>)}</div></Card>
          <Card className="p-5"><div className="flex items-center justify-between"><h2 className="font-semibold text-ink">Upcoming SIPs</h2><a href="/invest/sips" className="text-xs font-semibold text-accent">View all</a></div>{activeSips.length ? <div className="mt-4 grid gap-3">{activeSips.slice(0, 3).map(sip => <div key={sip.id} className="flex items-center justify-between gap-3 rounded-2xl bg-surface-2 p-3"><div><div className="text-sm font-semibold text-ink">₹{Number(sip.amount || 0).toLocaleString("en-IN")}</div><div className="mt-1 text-xs text-ink-faint">Next debit: {sip.next_debit_date || "Date unavailable"}</div></div><StatusPill status={sip.mandate_status || "active"} /></div>)}</div> : <div className="mt-6 py-5 text-center"><div className="text-sm font-semibold text-ink">No SIP scheduled</div><p className="mt-2 text-xs leading-5 text-ink-muted">Upcoming dates will appear after a mandate and SIP are confirmed.</p></div>}</Card>
        </div>
      </div>
    </>}
  </InvestShell>;
}
