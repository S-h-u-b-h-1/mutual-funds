"use client";

import { useEffect, useState } from "react";

import InvestShell, { ButtonLink, Card, InvestIcon, StatusPill } from "./InvestShell";
import { ErrorCard, LoadingCards, useInvestData } from "./useInvestData";
import { documentsApi, investApi, notificationsApi, portfolioApi, sipApi } from "../../lib/invest/api";

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

function formatMoney(value) {
  return value == null ? "Not available" : money.format(Number(value));
}

function formatPct(value) {
  return value == null ? "Not available" : `${percent.format(Number(value))}%`;
}

function gainTone(value) {
  if (value == null || Number(value) === 0) return "text-ink";
  return Number(value) > 0 ? "text-pos" : "text-neg";
}

export default function InvestDashboard() {
  const { data, loading, error, refresh } = useInvestData();
  const [summary, setSummary] = useState(null);
  const [dataQuality, setDataQuality] = useState(null);
  const [summaryError, setSummaryError] = useState("");
  const [dashboardData, setDashboardData] = useState({ orders: [], sips: [], documents: [], unreadNotifications: null });
  useEffect(() => {
    Promise.allSettled([portfolioApi.getSummary(), portfolioApi.getDataQuality(), investApi.getOrders(), sipApi.list(), documentsApi.list(), notificationsApi.unreadCount()]).then(([summaryResult, qualityResult, orders, sips, documents, unreadResult]) => {
      if (summaryResult.status === "fulfilled") setSummary(summaryResult.value.summary || summaryResult.value);
      else setSummaryError(summaryResult.reason?.message || "Portfolio summary unavailable.");
      if (qualityResult.status === "fulfilled") setDataQuality(qualityResult.value);
      setDashboardData({ orders: orders.status === "fulfilled" ? orders.value.orders || [] : [], sips: sips.status === "fulfilled" ? sips.value.sips || [] : [], documents: documents.status === "fulfilled" ? documents.value.documents || [] : [], unreadNotifications: unreadResult.status === "fulfilled" ? unreadResult.value.count : null });
    });
  }, []);
  const readiness = data?.compliance;
  const ready = readiness?.overallStatus === "completed";
  const pendingOrders = dashboardData.orders.filter(order => !["completed", "failed", "cancelled", "reversed"].includes(order.status));
  const failedOrders = dashboardData.orders.filter(order => ["failed", "retry_required"].includes(order.status));
  const activeSips = dashboardData.sips.filter(sip => ["active", "verified", "completed"].includes(sip.mandate_status || sip.status));
  const unread = dashboardData.unreadNotifications;
  const actionCount = (ready ? 0 : 1) + pendingOrders.length + failedOrders.length + (unread || 0);
  const topMetrics = [
    ["Net worth", formatMoney(summary?.totalValue), summary?.latestOfficialNavDate ? `NAV as of ${summary.latestOfficialNavDate}` : "Connect or import a portfolio"],
    ["Today's change", summary?.latestNavDayChange ? formatMoney(summary.latestNavDayChange.value) : "Not available", summary?.latestNavDayChange?.coveragePct != null ? `${summary.latestNavDayChange.coveragePct}% holding coverage` : "Daily movement appears when NAV-day data exists"],
    ["Total gain", formatMoney(summary?.gainLoss), summary?.gainLossPct == null ? "Return percentage unavailable" : `${formatPct(summary.gainLossPct)} absolute return`, gainTone(summary?.gainLoss)],
    ["Portfolio health", summary?.healthScore == null ? "Not available" : `${summary.healthScore}/100`, dataQuality?.latestNavCoveragePct == null ? "Awaiting valuation coverage" : `${dataQuality.latestNavCoveragePct}% NAV coverage`],
  ];
  return <InvestShell title="Your wealth, clearly." description="A calm view of what is invested, what needs attention, and what comes next." actions={<ButtonLink href={ready ? "/funds" : "/invest/onboarding"}>{ready ? "Explore investments" : "Continue setup"}</ButtonLink>}>
    {loading ? <LoadingCards /> : error ? <ErrorCard message={error} retry={refresh} /> : <>
      <Card className="relative overflow-hidden p-6 sm:p-8">
        <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-accent/10 blur-3xl" aria-hidden="true" />
        <div className="relative grid gap-8 xl:grid-cols-[1fr_340px] xl:items-end">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-ink-muted"><span className="h-2 w-2 rounded-full bg-pos" />Portfolio overview</div>
            <div className="mt-5 break-words text-[clamp(2.5rem,6vw,5rem)] font-semibold tracking-[-.07em] text-ink">{formatMoney(summary?.totalValue)}</div>
            <p className="mt-2 text-sm text-ink-muted">{summaryError || (summary?.totalValue == null ? "Current value will appear after a portfolio is connected" : "Current value · latest server valuation")}</p>
            <div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {topMetrics.map(([label, value, detail, tone = "text-ink"]) => (
                <div key={label} className="rounded-2xl bg-surface-2 p-4">
                  <div className="text-xs text-ink-faint">{label}</div>
                  <div className={`mt-1 break-words text-lg font-semibold ${tone}`}>{value}</div>
                  <div className="mt-1 text-[11px] leading-4 text-ink-faint">{detail}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-[1.45rem] border border-line bg-bg/55 p-5">
            <div className="flex items-center justify-between"><div><div className="text-xs font-semibold text-ink">Investment readiness</div><div className="mt-1 text-xs text-ink-faint">{readiness?.completed || 0} of {readiness?.total || 9} checks complete</div></div><div className="text-2xl font-semibold text-ink">{readiness?.percent || 0}%</div></div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${readiness?.percent || 0}%` }} /></div>
            <div className="mt-4 flex items-center justify-between gap-3"><StatusPill status={readiness?.overallStatus} /><a href="/invest/compliance" className="text-xs font-semibold text-accent">Review steps →</a></div>
          </div>
        </div>
      </Card>

      {dataQuality && <p role="status" className={`mt-3 rounded-2xl p-3 text-xs leading-5 ${dataQuality.staleHoldingCount > 0 || dataQuality.latestNavCoveragePct == null ? "bg-warn/10 text-warn" : "bg-surface-2 text-ink-faint"}`}>
        Valuation data: {dataQuality.latestNavCoveragePct == null ? "NAV coverage unavailable" : `${dataQuality.latestNavCoveragePct}% NAV coverage`}
        {dataQuality.staleHoldingCount > 0 ? ` · ${dataQuality.staleHoldingCount} holding${dataQuality.staleHoldingCount === 1 ? " has" : "s have"} an older NAV` : " · no stale holdings reported"}
        {dataQuality.navDateRange?.newest ? ` · latest holding NAV ${dataQuality.navDateRange.newest}` : ""}
      </p>}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{[["Invested amount", formatMoney(summary?.investedValue), "/invest/portfolio"], ["Active SIP amount", money.format(activeSips.reduce((total, sip) => total + Number(sip.amount || 0), 0)), "/invest/sips"], ["Pending transactions", pendingOrders.length, "/invest/transactions"], ["Documents", dashboardData.documents.length, "/invest/documents"], ["Unread notifications", unread == null ? "Not available" : unread, "/invest/notifications"]].map(([label, value, href]) => <a key={label} href={href} className="rounded-2xl border border-line bg-surface p-4 transition hover:border-accent/40"><div className="text-xs text-ink-faint">{label}</div><div className="mt-2 text-2xl font-semibold text-ink">{value}</div><div className="mt-2 text-xs font-semibold text-accent">View details →</div></a>)}</div>

      <Card className={`mt-5 p-5 ${actionCount > 0 ? "border-warn/40 bg-warn/10" : ""}`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[.16em] text-accent">Action required</div>
            <h2 className="mt-1 text-lg font-semibold text-ink">{actionCount > 0 ? `${actionCount} item${actionCount === 1 ? "" : "s"} need attention` : "Nothing urgent right now"}</h2>
            <p className="mt-1 text-sm leading-6 text-ink-muted">{ready ? "Investment readiness is complete." : "Complete investment readiness before placing new mutual-fund investments."} {failedOrders.length ? `${failedOrders.length} order${failedOrders.length === 1 ? " needs" : "s need"} retry or support review.` : ""}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!ready && <ButtonLink href="/invest/compliance">Complete readiness</ButtonLink>}
            {pendingOrders.length > 0 && <ButtonLink href="/invest/transactions" secondary>Track transactions</ButtonLink>}
            {failedOrders.length > 0 && <ButtonLink href="/invest/orders" secondary>Review failures</ButtonLink>}
          </div>
        </div>
      </Card>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
        <div className="grid gap-5 sm:grid-cols-2">
          <Card className="p-5"><div className="flex items-center gap-3"><InvestIcon>◎</InvestIcon><div><h2 className="font-semibold text-ink">Asset allocation</h2><p className="text-xs text-ink-faint">After your first holding</p></div></div><div className="mt-8 flex items-center gap-5"><div className="grid h-24 w-24 place-items-center rounded-full border-[10px] border-line text-xs font-semibold text-ink-faint">No data</div><div><p className="text-sm leading-6 text-ink-muted">Connect your existing mutual funds to see one consolidated portfolio.</p><a href="/portfolio#portfolio-import" className="mt-3 inline-flex text-sm font-semibold text-accent">Import a statement →</a></div></div></Card>
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
