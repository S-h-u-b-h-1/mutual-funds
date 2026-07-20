"use client";

import { useState } from "react";
import InvestShell, { ButtonLink, Card, InvestIcon } from "./InvestShell";

const configs = {
  portfolio: { title:"A portfolio you can understand.", description:"Returns, exposure, risk and goals will live together—with every number traceable to source data.", action:["Connect existing portfolio","/portfolio"], icon:"◒", empty:"No investment portfolio is connected", detail:"Import an existing CAS in the current portfolio workspace. Suasion transaction holdings will appear here when the order API is available." },
  orders: { title:"Every order, explained.", description:"Follow an investment from review through unit allotment without wondering what happens next.", action:["Research funds","/funds"], icon:"↗", empty:"No investment orders yet", detail:"Order placement is intentionally unavailable until Claude's authenticated order contract and persistence layer are ready. No money can move from this screen." },
  transactions: { title:"A complete money trail.", description:"Search, filter and export a clear record of investments, SIPs, redemptions and payment status.", action:["View orders","/invest/orders"], icon:"⇄", empty:"No transactions to show", detail:"Transactions will appear after an order is accepted by the investment provider." },
  documents: { title:"Every document, one secure place.", description:"Statements, KYC records, tax reports, mandates and confirmations—searchable and clearly categorized.", action:["Upload existing portfolio","/portfolio"], icon:"▤", empty:"Your vault is empty", detail:"Generated confirmations and provider documents will appear here when secure document-storage APIs are connected." },
  notifications: { title:"Only what deserves attention.", description:"A calm inbox for readiness updates, transactions, SIP reminders and advisor messages.", action:["Review readiness","/invest/compliance"], icon:"◌", empty:"You’re all caught up", detail:"New account and investment events will appear here. Marketing messages are kept separate." },
  advisor: { title:"Guidance when you want it.", description:"Request a portfolio review, schedule a conversation, or track a service request without chasing updates.", action:["Open public advisor desk","/advisor"], icon:"◇", empty:"No advisor conversation yet", detail:"Your assigned relationship manager and secure message history will appear here after the advisor-service API is connected." },
};

const lifecycle = ["Investment submitted", "Payment confirmed", "Sent for processing", "Units allotted", "Completed"];

export default function InvestModule({ kind }) {
  const c = configs[kind];
  const [query, setQuery] = useState("");
  return <InvestShell title={c.title} description={c.description} actions={<ButtonLink href={c.action[1]}>{c.action[0]}</ButtonLink>}>
    {(kind === "transactions" || kind === "documents") && <div className="mb-5 flex flex-col gap-3 rounded-[1.4rem] border border-line bg-surface p-3 sm:flex-row"><label className="min-w-0 flex-1"><span className="sr-only">Search {kind}</span><input value={query} onChange={e=>setQuery(e.target.value)} className="min-h-11 w-full rounded-xl bg-surface-2 px-4 text-sm text-ink outline-none focus:ring-2 focus:ring-accent/20" placeholder={`Search ${kind}…`} /></label><button type="button" className="min-h-11 rounded-xl border border-line px-4 text-sm font-semibold text-ink">Filters</button><button type="button" disabled className="min-h-11 rounded-xl border border-line px-4 text-sm font-semibold text-ink disabled:opacity-40">Export</button></div>}
    <div className="grid gap-5 xl:grid-cols-[1fr_330px]">
      <Card className="grid min-h-[390px] place-items-center p-7 text-center"><div className="max-w-md"><div className="mx-auto grid h-16 w-16 place-items-center rounded-[1.4rem] bg-accent/10 text-2xl text-accent" aria-hidden="true">{c.icon}</div><h2 className="mt-5 text-xl font-semibold tracking-[-.035em] text-ink">{c.empty}</h2><p className="mt-3 text-sm leading-6 text-ink-muted">{c.detail}</p><div className="mt-6"><ButtonLink href={c.action[1]} secondary>{c.action[0]}</ButtonLink></div></div></Card>
      <div className="grid content-start gap-5">
        {kind === "orders" ? <Card className="p-5"><div className="text-[10px] font-bold uppercase tracking-[.16em] text-accent">Order lifecycle</div><div className="mt-5 grid gap-0">{lifecycle.map((x,i)=><div key={x} className="flex gap-3"><div className="flex flex-col items-center"><span className="grid h-7 w-7 place-items-center rounded-full border border-line text-[10px] font-bold text-ink-faint">{i+1}</span>{i<lifecycle.length-1&&<span className="h-7 w-px bg-line"/>}</div><span className="pt-1 text-xs font-semibold text-ink-muted">{x}</span></div>)}</div></Card> : <Card className="p-5"><div className="flex items-center gap-3"><InvestIcon>✓</InvestIcon><div><h2 className="text-sm font-semibold text-ink">Source-aware by design</h2><p className="mt-1 text-xs leading-5 text-ink-muted">Unavailable provider data is explained, never estimated.</p></div></div></Card>}
        <Card className="p-5"><h2 className="text-sm font-semibold text-ink">Module status</h2><div className="mt-4 rounded-2xl bg-information/10 p-4"><div className="text-xs font-bold uppercase tracking-[.12em] text-information">Awaiting API</div><p className="mt-2 text-xs leading-5 text-ink-muted">The production interface is ready for its documented REST contract. Actions remain disabled until authenticated persistence exists.</p></div></Card>
      </div>
    </div>
  </InvestShell>;
}
