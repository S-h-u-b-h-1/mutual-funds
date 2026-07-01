"use client";
import { useState } from "react";
import { track } from "../lib/track";
import { SUPA } from "../lib/supabase";

const INVESTOR_TYPES = ["First-time investor", "Existing investor", "Advisor/distributor", "Institutional"];
const INTERESTS = ["Portfolio review", "Fund selection help", "Understanding a specific fund", "General guidance"];

// Soft advisor-contact form -> advisor_leads (public INSERT only, DB-enforced consent gate;
// see supabase migration advisor_leads). No submission is ever readable by the client-exposed
// anon key. Never auto-subscribes to anything beyond this one submission.
export default function AdvisorContactForm({ sourcePage = "advisor_page" }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", investorType: "", interest: "", message: "", consent: false });
  const [state, setState] = useState("idle"); // idle | ok | err

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  function submit(e) {
    e.preventDefault();
    if (!form.name.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email) || !form.consent) {
      setState("err");
      return;
    }
    fetch(`${SUPA.URL}/rest/v1/advisor_leads`, {
      method: "POST",
      headers: { apikey: SUPA.KEY, Authorization: `Bearer ${SUPA.KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim() || null,
        investor_type: form.investorType || null, interest_area: form.interest || null,
        message: form.message.trim() || null, source_page: sourcePage, consent: form.consent,
      }),
    }).catch(() => {});
    track("advisor_contact_submit", { source_page: sourcePage, interest: form.interest || null });
    setState("ok");
    setForm({ name: "", email: "", phone: "", investorType: "", interest: "", message: "", consent: false });
  }

  if (state === "ok") {
    return (
      <div className="glass p-6 text-center">
        <div className="text-[15px] font-semibold text-ink">Thanks — we&rsquo;ve received your request.</div>
        <p className="mt-1.5 text-[13px] text-ink-muted">Suasion Securities will reach out to the details you shared. No spam, no mailing list — just this request.</p>
      </div>
    );
  }

  const inputCls = "w-full rounded-xl border border-line-strong bg-bg px-3.5 py-2.5 text-[13.5px] text-ink placeholder:text-ink-faint outline-none focus:border-accent";

  return (
    <form onSubmit={submit} className="glass p-5 sm:p-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input className={inputCls} placeholder="Name *" value={form.name} onChange={set("name")} required />
        <input className={inputCls} type="email" placeholder="Email *" value={form.email} onChange={set("email")} required />
        <input className={inputCls} type="tel" placeholder="Phone (optional)" value={form.phone} onChange={set("phone")} />
        <select className={inputCls} value={form.investorType} onChange={set("investorType")}>
          <option value="">Investor type (optional)</option>
          {INVESTOR_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className={`${inputCls} sm:col-span-2`} value={form.interest} onChange={set("interest")}>
          <option value="">What do you need help with? (optional)</option>
          {INTERESTS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <textarea className={`${inputCls} sm:col-span-2`} rows={3} placeholder="Anything specific you'd like to mention? (optional)" value={form.message} onChange={set("message")} />
      </div>

      <label className="mt-4 flex items-start gap-2.5 text-[12px] text-ink-muted">
        <input type="checkbox" checked={form.consent} onChange={set("consent")} className="mt-0.5 h-4 w-4 shrink-0 rounded border-line-strong" />
        <span>I consent to MF Pulse sharing these details with Suasion Securities so they can contact me about this request. This is a single request, not a subscription.</span>
      </label>

      {state === "err" && <p className="mt-2 text-[12px] text-neg">Please enter your name, a valid email, and check the consent box.</p>}

      <button type="submit" className="mt-4 rounded-xl bg-accent px-5 py-2.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-accent-soft shadow-glow">
        Send request
      </button>
      <p className="mt-3 text-[11px] text-ink-faint">MF Pulse is a research platform and does not itself provide investment advice. Not investment advice.</p>
    </form>
  );
}
