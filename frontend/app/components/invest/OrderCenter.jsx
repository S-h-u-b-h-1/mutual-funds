"use client";

import { useCallback, useEffect, useState } from "react";
import InvestShell, { Card, StatusPill } from "./InvestShell";
import TransactionTimeline from "./TransactionTimeline";
import SchemePicker from "./SchemePicker";
import { investApi } from "../../lib/invest/api";
import { ORDER_LABELS as labels, ORDER_STAGES as stageOrder, ORDER_STATUS_META as statusMeta } from "../../lib/invest/transactionStatus";

const money = (value) => value == null ? "Not available" : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(value));

export default function OrderCenter() {
  const [orders, setOrders] = useState([]);
  const [execution, setExecution] = useState(null);
  const [loading, setLoading] = useState(true);
  const [apiReady, setApiReady] = useState(null);
  const [error, setError] = useState("");
  const [review, setReview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftOrder, setDraftOrder] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [detail, setDetail] = useState(null);
  const [scheme, setScheme] = useState(null);
  const [amount, setAmount] = useState("");

  const load = useCallback(async () => {
    try {
      const [ordersValue, readinessValue] = await Promise.all([investApi.getOrders(), investApi.getExecutionReadiness()]);
      setOrders(ordersValue.orders || []);
      setExecution(readinessValue.readiness || null);
      setApiReady(true);
      setError("");
    } catch (err) {
      setApiReady(false);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  const active = orders.some((order) => ["submitted", "processing", "units_pending"].includes(order.status));
  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(load, 6000);
    return () => clearInterval(timer);
  }, [active, load]);

  const live = execution?.liveExecutionReady === true;
  const distributor = execution?.distributor;

  async function prepareReview(event) {
    event.preventDefault();
    if (!live) { setError("Live order creation is locked until every platform execution control is verified."); return; }
    if (!scheme?.code) { setError("Choose a Regular-plan scheme from the search results before continuing."); return; }
    setSaving(true); setError("");
    try {
      const value = await investApi.createOrder({ schemeCode: scheme.code, orderType: "purchase", amount: Number(amount), draft: true });
      setDraftOrder(value.order); setReview(true); await load();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  async function submit() {
    if (!live) { setError("Live submission remains locked; no money was moved."); return; }
    setSaving(true); setError("");
    try {
      const value = await investApi.submitOrder(draftOrder.id);
      setConfirmation(value.order); setDraftOrder(null); setReview(false); setScheme(null); setAmount(""); await load();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  async function cancelDraft() {
    setSaving(true); setError("");
    try { await investApi.cancelOrder(draftOrder.id); setDraftOrder(null); setReview(false); }
    catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  async function openDetails(order) {
    setError("");
    try { setDetail(await investApi.getOrder(order.id)); }
    catch (err) { setError(err.message); }
  }

  async function mutate(orderId, action) {
    setSaving(true); setError("");
    try {
      const value = await action(orderId);
      setOrders((current) => current.map((order) => order.id === orderId ? value.order : order));
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  return <InvestShell title="Every order, explained." description="Research Regular plans, review the execution controls, and follow every confirmed provider status change." actions={<a href="/funds" className="inline-flex min-h-11 items-center rounded-full border border-line bg-surface px-5 text-sm font-semibold text-ink">Research funds</a>}>
    <section className={`mb-5 rounded-[1.6rem] border p-5 sm:p-6 ${live ? "border-pos/25 bg-pos/10" : "border-warn/30 bg-warn/10"}`} aria-labelledby="execution-status-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <div className={`text-[10px] font-bold uppercase tracking-[.16em] ${live ? "text-pos" : "text-warn"}`}>Platform execution status</div>
          <h2 id="execution-status-title" className="mt-2 text-xl font-semibold text-ink">{live ? "Production execution verified" : "Live ordering is safely locked"}</h2>
          <p className="mt-2 text-sm leading-6 text-ink-muted">{execution?.message || "Checking the mutual-fund transaction controls…"}</p>
          <p className="mt-3 text-xs leading-5 text-ink-faint">ARN-routed transactions are restricted to <strong className="text-ink">Regular plans</strong>. Direct plans require a separately registered direct/EOP route.</p>
        </div>
        <div className="min-w-48 rounded-2xl border border-line bg-surface/75 p-4">
          <div className="text-xs text-ink-faint">Platform controls</div>
          <div className="mt-1 text-2xl font-semibold text-ink">{execution ? `${execution.completed}/${execution.total}` : "—"}</div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2"><div className={`h-full rounded-full ${live ? "bg-pos" : "bg-warn"}`} style={{ width: `${execution?.percent || 0}%` }} /></div>
          <a href="/invest/compliance" className="mt-3 inline-flex text-xs font-semibold text-accent">Review every control →</a>
        </div>
      </div>
      {distributor ? <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-line/70 pt-4 text-xs text-ink-muted"><span>Distributor: <strong className="text-ink">{distributor.name || "Suasion Securities"}</strong></span><span>ARN: <strong className="text-ink">{distributor.arn || "Not verified"}</strong></span><span>EUIN: <strong className="text-ink">{distributor.euin || "Not verified"}</strong></span><span>ARN valid until: <strong className="text-ink">{distributor.arnValidUntil || "Not recorded"}</strong></span></div> : null}
    </section>

    {confirmation ? <><TransactionTimeline currentStatus={confirmation.status} reference={confirmation.id} amount={confirmation.amount} scheme={confirmation.scheme_code} nextStep={confirmation.status === "submitted" ? "Confirmed provider processing update" : "Backend lifecycle update"} /><p className="mt-3 rounded-2xl bg-surface-2 p-4 text-xs leading-5 text-ink-muted">Payment: <strong className="text-ink">{confirmation.payment_status || "Not supplied"}</strong>{confirmation.payment_reference ? <> · Reference <strong className="text-ink">{confirmation.payment_reference}</strong></> : null} · ARN <strong className="text-ink">{confirmation.distributor_arn || "Not stamped"}</strong> · EUIN <strong className="text-ink">{confirmation.distributor_euin || "Not stamped"}</strong></p></> : null}

    <div className="grid gap-5 xl:grid-cols-[390px_minmax(0,1fr)]">
      <Card className="h-fit p-5 sm:p-6">
        <div className="text-[10px] font-bold uppercase tracking-[.16em] text-accent">New purchase · Regular plan</div>
        <h2 className="mt-2 text-xl font-semibold text-ink">{review ? "Review before submitting" : "Investment details"}</h2>
        {review ? <div className="mt-5">
          <div className="rounded-2xl border border-accent/20 bg-accent/5 p-4 text-sm text-ink">Draft saved on the server. Submission still passes the live execution gate.</div>
          <dl className="mt-4 grid gap-3 rounded-2xl bg-surface-2 p-4 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-ink-faint">Scheme</dt><dd className="text-right font-semibold text-ink">{scheme?.name || "Scheme name unavailable"}<span className="block text-xs font-normal text-ink-faint">{scheme?.plan || "Plan unavailable"} · {scheme?.option || "Option unavailable"}</span></dd></div>
            <div className="flex justify-between gap-4"><dt className="text-ink-faint">Amount</dt><dd className="font-semibold text-ink">{money(amount)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-ink-faint">Attribution</dt><dd className="text-right text-xs font-semibold text-ink">ARN {distributor?.arn || "pending"}<span className="block font-normal text-ink-faint">EUIN {distributor?.euin || "pending"}</span></dd></div>
          </dl>
          <div className="mt-5 flex gap-2"><button type="button" onClick={() => setReview(false)} disabled={saving} className="min-h-11 flex-1 rounded-full border border-line text-sm font-semibold text-ink">Edit</button><button type="button" onClick={submit} disabled={saving || !live} className="min-h-11 flex-1 rounded-full bg-accent text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{saving ? "Submitting…" : live ? "Submit purchase" : "Live ordering locked"}</button></div>
          <button type="button" onClick={cancelDraft} disabled={saving} className="mt-3 min-h-10 w-full text-xs font-semibold text-ink-muted">Cancel saved draft</button>
        </div> : <form onSubmit={prepareReview} className="mt-5 grid gap-5">
          <SchemePicker value={scheme} onChange={setScheme} label="Regular-plan fund or scheme" required planFilter="regular" disabled={!live} />
          <label className="text-xs font-semibold text-ink-muted">Amount in rupees<input className="mt-2 min-h-12 w-full rounded-2xl border border-line bg-bg px-4 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 disabled:cursor-not-allowed disabled:opacity-50" type="number" min="1" value={amount} onChange={(event) => setAmount(event.target.value)} required disabled={!live} /></label>
          <button type="submit" disabled={!apiReady || saving || !scheme || !live} className="min-h-12 rounded-full bg-ink px-5 text-sm font-semibold text-bg disabled:cursor-not-allowed disabled:opacity-40">{saving ? "Saving draft…" : !live ? "Live ordering locked" : apiReady === null ? "Checking order service…" : apiReady ? "Review purchase" : "Order service unavailable"}</button>
          {!live ? <p className="text-xs leading-5 text-ink-faint">No payment or investment provider will be called until the platform checklist is fully verified.</p> : null}
        </form>}
        {error ? <p role="alert" className="mt-4 rounded-2xl bg-neg/10 p-4 text-xs leading-5 text-neg">{error}</p> : null}
      </Card>

      <div className="grid content-start gap-4">
        <div className="flex items-center justify-between"><h2 className="text-lg font-semibold text-ink">Order history</h2><button type="button" onClick={load} className="min-h-10 rounded-full border border-line px-4 text-xs font-semibold text-ink">Refresh</button></div>
        {loading ? <div className="h-44 skeleton rounded-[1.6rem]" role="status" aria-label="Loading orders" aria-busy="true" /> : orders.length === 0 ? <Card className="grid min-h-64 place-items-center p-7 text-center"><div><div className="text-lg font-semibold text-ink">No investment orders yet</div><p className="mt-2 text-sm text-ink-muted">Verified orders and saved drafts will appear here.</p></div></Card> : orders.map((order) => {
          const meta = statusMeta[order.status] || [order.status, "The provider returned an unknown state."];
          const current = Math.max(0, stageOrder.indexOf(order.status));
          return <Card key={order.id} className="p-5">
            <button type="button" onClick={() => openDetails(order)} className="block w-full text-left">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-xs capitalize text-ink-faint">{order.order_type?.replaceAll("_", " ")}</div><div className="mt-1 text-lg font-semibold text-ink">{order.amount != null ? money(order.amount) : `${order.units} units`}</div><div className="mt-1 text-xs text-ink-faint">{order.plan || order.option ? `${order.plan || "Plan unavailable"} · ${order.option || "Option unavailable"}` : "Plan and option unavailable"}</div></div><StatusPill status={order.status} /></div>
              <div className="mt-5 grid grid-cols-5 gap-1" aria-label={`Order status: ${order.status}`}>{stageOrder.map((stage, index) => <div key={stage} className="min-w-0"><div className={`h-1.5 rounded-full ${current >= index ? "bg-accent" : "bg-line"}`} /><div className="mt-2 hidden truncate text-[9px] text-ink-faint sm:block">{labels[stage]}</div></div>)}</div>
              <div className="mt-4 rounded-2xl bg-surface-2 p-3"><div className="flex items-center justify-between gap-3"><span className="text-sm font-semibold text-ink">{meta[0]}</span><span className="text-xs text-accent">View timeline →</span></div><p className="mt-1 text-xs leading-5 text-ink-muted">{meta[1]}</p></div>
              {order.payment_status ? <p className="mt-2 text-xs text-ink-faint">Payment: {order.payment_status}{order.provider_error_code ? ` · ${order.provider_error_code}` : ""}</p> : null}
            </button>
            {order.status === "retry_required" ? <button type="button" onClick={() => mutate(order.id, investApi.retryOrder)} disabled={saving || !live} className="mt-4 min-h-10 rounded-full bg-accent px-4 text-xs font-semibold text-white disabled:opacity-40">{live ? "Retry order" : "Retry locked"}</button> : null}
            {["draft", "submitted", "processing"].includes(order.status) ? <button type="button" onClick={() => mutate(order.id, investApi.cancelOrder)} disabled={saving} className="mt-4 min-h-10 rounded-full border border-line px-4 text-xs font-semibold text-ink">Cancel</button> : null}
          </Card>;
        })}
        {detail ? <TransactionTimeline currentStatus={detail.order?.status} reference={detail.order?.id} amount={detail.order?.amount} scheme={detail.order?.scheme_code} nextStep="Confirmed provider lifecycle update" events={detail.timeline || []} /> : null}
      </div>
    </div>
  </InvestShell>;
}
