"use client";

import InvestShell, { ButtonLink, Card, StatusPill } from "./InvestShell";
import { ErrorCard, LoadingCards, useInvestData } from "./useInvestData";

const copy = {
  mobile: ["Mobile verified", "Protects account access and transaction updates.", "2 min"], email: ["Email verified", "Receipts and important service communication.", "2 min"],
  pan: ["PAN verification", "Required for identity and tax reporting.", "3 min"], identity: ["Identity check", "Confirms your KYC status with recorded consent.", "5 min"],
  nominee: ["Nominee", "Helps your investments reach the right person.", "4 min"], bank: ["Bank verification", "Confirms where redemptions and mandates belong.", "4 min"],
  fatca: ["FATCA declaration", "A required tax-residency declaration.", "2 min"], risk_profile: ["Risk profile", "Aligns products with your capacity and experience.", "5 min"],
  investment_ready: ["Investment ready", "Unlocked automatically when every required check is complete.", "Automatic"],
};

export default function ComplianceCenter() {
  const { data, loading, error, refresh } = useInvestData();
  const c = data?.compliance;
  const items = [...(c?.items || [])].sort((a,b) => Object.keys(copy).indexOf(a.item_key) - Object.keys(copy).indexOf(b.item_key));
  const next = items.find(i => !["verified","completed"].includes(i.status) && i.item_key !== "investment_ready");
  return <InvestShell eyebrow="Investment readiness" title={`${c?.percent || 0}% ready`} description="Compliance is a guided path, not paperwork. Every check explains why it matters and what happens next." actions={<ButtonLink href={next ? `/invest/onboarding?step=${next.item_key}` : "/invest"}>{next ? "Continue next step" : "Return to overview"}</ButtonLink>}>
    {loading ? <LoadingCards /> : error ? <ErrorCard message={error} retry={refresh} /> : <>
      <Card className="overflow-hidden p-6 sm:p-8"><div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center"><div><div className="flex items-center justify-between text-sm"><span className="font-semibold text-ink">{c.completed} of {c.total} checks complete</span><StatusPill status={c.overallStatus} /></div><div className="mt-4 h-3 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-accent" style={{width:`${c.percent}%`}} /></div><p className="mt-3 text-xs text-ink-faint">Estimated time remaining depends on provider review. You can save and resume safely.</p></div><div className="rounded-2xl bg-pos/10 px-5 py-4 text-center"><div className="text-2xl font-semibold text-pos">{c.percent}%</div><div className="text-[10px] font-bold uppercase tracking-[.12em] text-pos">Readiness</div></div></div></Card>
      <div className="mt-5 grid gap-3">
        {items.map((item, index) => { const meta = copy[item.item_key] || [item.item_key,"Required check","A few minutes"]; const done = ["verified","completed"].includes(item.status); return <Card key={item.item_key} className="p-4 sm:p-5"><div className="flex gap-4"><div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold ${done ? "bg-pos text-white" : "bg-surface-2 text-ink-muted"}`}>{done ? "✓" : index + 1}</div><div className="min-w-0 flex-1 sm:flex sm:items-center sm:justify-between sm:gap-6"><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-ink">{meta[0]}</h2><StatusPill status={item.status} /></div><p className="mt-1 text-sm leading-6 text-ink-muted">{meta[1]}</p>{item.rejection_reason && <p className="mt-2 text-xs font-medium text-neg">{item.rejection_reason}</p>}</div><div className="mt-3 flex shrink-0 items-center gap-4 sm:mt-0"><span className="text-xs text-ink-faint">{meta[2]}</span>{!done && item.item_key !== "investment_ready" && <a href={`/invest/onboarding?step=${item.item_key}`} className="text-sm font-semibold text-accent">Open →</a>}</div></div></div></Card>})}
      </div>
      <p className="mx-auto mt-6 max-w-2xl text-center text-xs leading-5 text-ink-faint">Verification providers are operating in mock mode during this phase. No real KYC, document retrieval, payment, or investment is performed.</p>
    </>}
  </InvestShell>;
}
