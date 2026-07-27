"use client";

import { useEffect, useMemo, useState } from "react";
import InvestShell, { ButtonLink, Card, StatusPill } from "./InvestShell";
import TransactionTimeline from "./TransactionTimeline";
import SchemePicker from "./SchemePicker";
import { portfolioApi, redemptionApi } from "../../lib/invest/api";

const inputClass = "mt-2 min-h-12 w-full rounded-2xl border border-line bg-bg px-4 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/15";
const money = value => value == null ? "Not available" : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value));

function holdingLabel(holding) {
  return `${holding.schemeName || "Scheme name unavailable"}${holding.folioNumber ? ` · Folio ${holding.folioNumber}` : ""}`;
}

export default function RedemptionCenter() {
  const [holdings, setHoldings] = useState([]);
  const [loadingHoldings, setLoadingHoldings] = useState(true);
  const [holdingsError, setHoldingsError] = useState("");
  const [scheme, setScheme] = useState(null);
  const [form, setForm] = useState({ folioNumber: "", mode: "units", value: "" });
  const [eligibility, setEligibility] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [review, setReview] = useState(false);
  const [order, setOrder] = useState(null);
  const [detail, setDetail] = useState(null);

  async function loadHoldings() {
    setLoadingHoldings(true); setHoldingsError("");
    try {
      const response = await portfolioApi.getHoldings();
      setHoldings(Array.isArray(response.holdings) ? response.holdings.filter(item => item.schemeCode) : []);
    } catch (err) { setHoldingsError(err.message || "Your holdings could not be loaded."); }
    finally { setLoadingHoldings(false); }
  }

  useEffect(() => { loadHoldings(); }, []);
  useEffect(() => {
    if (!scheme?.code) { setEligibility(null); return undefined; }
    const timer = setTimeout(async () => {
      setLoading(true); setError(""); setEligibility(null);
      try { setEligibility(await redemptionApi.eligibility(scheme.code)); }
      catch (err) { setError(err.message || "Eligibility could not be checked."); }
      finally { setLoading(false); }
    }, 200);
    return () => clearTimeout(timer);
  }, [scheme?.code]);

  const folio = useMemo(() => eligibility?.folios?.find(item => item.folioNumber === form.folioNumber) || eligibility?.folios?.[0], [eligibility, form.folioNumber]);
  useEffect(() => { if (folio && !form.folioNumber) setForm(current => ({ ...current, folioNumber: folio.folioNumber })); }, [folio, form.folioNumber]);
  function chooseScheme(value) {
    if (value && !holdings.some(item => item.schemeCode === value.code)) {
      setError("Choose a fund from the holdings shown in your portfolio.");
      return;
    }
    setError(""); setScheme(value); setForm({ folioNumber: "", mode: "units", value: "" }); setReview(false); setOrder(null); setDetail(null);
  }
  function chooseFolio(value) { setForm(current => ({ ...current, folioNumber: value, value: "" })); setReview(false); }
  async function submit(event) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const result = await redemptionApi.create({ schemeCode: scheme.code, folioNumber: form.folioNumber, [form.mode]: Number(form.value) });
      setOrder(result.order); setDetail(result); setReview(false);
    } catch (err) { setError(err.message || "The redemption could not be submitted."); }
    finally { setSaving(false); }
  }
  const max = form.mode === "units" ? folio?.unitsRedeemable : folio?.availableAmount;
  const canReview = Boolean(scheme?.code && folio?.eligible && Number(form.value) > 0 && (!max || Number(form.value) <= Number(max)));

  return <InvestShell title="Redeem with clarity." description="Choose a fund from your eligible holdings. The server checks live folio eligibility, redeemable units, exit-load guidance, tax context and your verified payout bank before creating an order." actions={<ButtonLink href="/invest/orders" secondary>View orders</ButtonLink>}>
    <div className="mb-5 rounded-2xl border border-warn/25 bg-warn/10 p-4 text-xs leading-5 text-ink-muted"><strong className="text-warn">Important.</strong> NAV and exit-load figures are estimates where marked. Tax context is informational, not a tax liability calculation. Payout is not shown as credited until the provider confirms it.{eligibility?.navDate && <> Latest NAV used for this check: <strong>{eligibility.navDate}</strong>.</>}</div>
    {order && <div className="mb-5"><TransactionTimeline currentStatus={order.status} reference={order.id} amount={order.amount} units={order.units} scheme={order.scheme_code} nextStep={order.payout_status === "initiated" ? "Payout instruction initiated; bank credit is not confirmed" : "Provider processing update"} events={detail?.timeline || []} /></div>}
    {holdingsError && <div className="mb-5 rounded-2xl bg-neg/10 p-4 text-sm text-neg" role="alert">{holdingsError}<button type="button" onClick={loadHoldings} className="ml-3 underline">Retry</button></div>}
    <div className="grid gap-5 xl:grid-cols-[390px_minmax(0,1fr)]"><Card className="h-fit p-5 sm:p-6"><div className="text-[10px] font-bold uppercase tracking-[.16em] text-accent">New redemption</div><h2 className="mt-2 text-xl font-semibold text-ink">Choose what to redeem</h2>{!review && !order ? <form onSubmit={event => { event.preventDefault(); if (canReview) setReview(true); }} className="mt-5 grid gap-5"><SchemePicker value={scheme} onChange={chooseScheme} label="Fund from your holdings" id="redemption-scheme" required />{loadingHoldings && <p role="status" className="text-xs text-ink-faint">Loading your holdings…</p>}{!loadingHoldings && !holdingsError && holdings.length === 0 && <p className="rounded-2xl bg-surface-2 p-4 text-xs leading-5 text-ink-muted">No imported or invested holdings are available yet. Add a portfolio before starting a redemption.</p>}{loading && <p role="status" className="text-xs text-ink-faint">Checking live eligibility…</p>}{eligibility?.folios?.length > 0 && <label className="text-xs font-semibold text-ink-muted">Folio<select className={inputClass} value={form.folioNumber} onChange={event => chooseFolio(event.target.value)}>{eligibility.folios.map(item => <option key={item.folioNumber} value={item.folioNumber}>{item.folioNumber} · {item.unitsRedeemable} redeemable units</option>)}</select></label>}{folio && <div className="rounded-2xl bg-surface-2 p-4 text-xs leading-5"><div className="flex justify-between gap-3"><span className="text-ink-faint">Holding</span><strong className="max-w-[65%] text-right text-ink">{holdingLabel({ ...scheme, folioNumber: folio.folioNumber })}</strong></div><div className="mt-2 flex justify-between gap-3"><span className="text-ink-faint">Available value</span><strong className="text-ink">{money(folio.availableAmount)}</strong></div><div className="mt-2 flex justify-between gap-3"><span className="text-ink-faint">Redeemable units</span><strong className="text-ink">{folio.unitsRedeemable}</strong></div><div className="mt-2 text-ink-muted">{folio.eligible ? "This folio is eligible." : folio.blockers.join(" ")}</div></div>}{folio?.eligible && <><fieldset><legend className="text-xs font-semibold text-ink-muted">Redeem by</legend><div className="mt-2 grid grid-cols-2 gap-2">{[["units", "Units"], ["amount", "Amount"]].map(([value, label]) => <label key={value} className={`rounded-2xl border p-3 text-center text-xs font-semibold ${form.mode === value ? "border-accent bg-accent/5 text-accent" : "border-line text-ink-muted"}`}><input className="sr-only" type="radio" name="redemption-mode" value={value} checked={form.mode === value} onChange={event => setForm(current => ({ ...current, mode: event.target.value, value: "" }))} />{label}</label>)}</div></fieldset><label className="text-xs font-semibold text-ink-muted">{form.mode === "units" ? "Units" : "Gross amount in rupees"}<input className={inputClass} type="number" min="0.0001" step="0.0001" max={max || undefined} value={form.value} onChange={event => setForm(current => ({ ...current, value: event.target.value }))} required />{max && <span className="mt-1 block text-[11px] font-normal text-ink-faint">Maximum available: {form.mode === "units" ? `${max} units` : money(max)}</span>}</label><button type="submit" disabled={!canReview || saving} className="min-h-12 rounded-full bg-ink px-5 text-sm font-semibold text-bg disabled:opacity-40">Review redemption</button></>}{error && <p role="alert" className="rounded-2xl bg-neg/10 p-4 text-xs leading-5 text-neg">{error}</p>}</form> : review && folio ? <div className="mt-5"><div className="rounded-2xl border border-accent/20 bg-accent/5 p-4 text-sm text-ink">You are reviewing a redemption of <strong>{form.mode === "units" ? `${form.value} units` : money(form.value)}</strong> from <strong>{scheme.name}</strong>.</div><dl className="mt-4 grid gap-3 rounded-2xl bg-surface-2 p-4 text-sm"><div className="flex justify-between gap-4"><dt className="text-ink-faint">Folio</dt><dd className="font-semibold text-ink">{form.folioNumber}</dd></div><div className="flex justify-between gap-4"><dt className="text-ink-faint">Estimated exit load</dt><dd className="font-semibold text-ink">{folio.exitLoad?.estimatedPct == null ? "Not available" : `${folio.exitLoad.estimatedPct}% · ${money(folio.exitLoad.estimatedAmount)}`}</dd></div><div className="flex justify-between gap-4"><dt className="text-ink-faint">Payout bank</dt><dd className="font-semibold text-ink">{eligibility.payoutBank?.accountNumberMasked || "Not available"}</dd></div><div><dt className="text-ink-faint">Tax context</dt><dd className="mt-1 text-xs text-ink-muted">{folio.taxContext?.note || "Informational guidance from the eligibility response."}</dd></div></dl><div className="mt-5 flex gap-2"><button type="button" onClick={() => setReview(false)} className="min-h-11 flex-1 rounded-full border border-line text-sm font-semibold text-ink">Edit</button><button type="button" onClick={submit} disabled={saving} className="min-h-11 flex-1 rounded-full bg-accent text-sm font-semibold text-white disabled:opacity-50">{saving ? "Submitting…" : "Submit redemption"}</button></div></div> : <p className="mt-5 text-sm text-ink-muted">This redemption is now tracked below.</p>}</Card><div className="grid content-start gap-5"><Card className="p-5"><h2 className="font-semibold text-ink">What happens next</h2><ol className="mt-4 grid gap-3">{["Eligibility checked against your folio", "Redemption submitted to the provider", "Units processed and settlement status updated", "Payout instruction initiated after completion"].map((item, index) => <li key={item} className="flex gap-3 text-sm text-ink-muted"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent/10 text-xs font-bold text-accent">{index + 1}</span>{item}</li>)}</ol></Card><Card className="p-5"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold text-ink">Eligibility details</h2><StatusPill status={eligibility?.eligible ? "completed" : "pending"} /></div><p className="mt-3 text-sm leading-6 text-ink-muted">{eligibility?.taxTreatment?.treatmentDetail?.note || "Choose a fund to see live tax and exit-load guidance."}</p>{eligibility?.blockers?.length > 0 && <ul className="mt-4 grid gap-2 text-xs text-warn">{eligibility.blockers.map(blocker => <li key={blocker}>• {blocker}</li>)}</ul>}</Card></div></div>
  </InvestShell>;
}
