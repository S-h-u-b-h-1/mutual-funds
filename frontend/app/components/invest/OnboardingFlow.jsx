"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import InvestShell, { Card, StatusPill } from "./InvestShell";
import { ErrorCard, LoadingCards, useInvestData } from "./useInvestData";

const steps = [
  ["profile", "Profile"], ["mobile", "Mobile"], ["email", "Email"], ["pan", "PAN"], ["identity", "Identity"],
  ["risk_profile", "Risk profile"], ["preferences", "Preferences"], ["bank", "Bank"], ["nominee", "Nominee"], ["fatca", "Declaration"], ["pep", "PEP screening"],
];
const fieldClass = "mt-2 min-h-12 w-full rounded-2xl border border-line bg-bg px-4 text-sm text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15";
const labelClass = "text-xs font-semibold text-ink-muted";

function Field({ label, name, value, onChange, type="text", placeholder, required=true }) { return <label className={labelClass}>{label}<input className={fieldClass} name={name} value={value || ""} onChange={onChange} type={type} placeholder={placeholder} required={required} /></label>; }
function Select({ label, name, value, onChange, children }) { return <label className={labelClass}>{label}<select className={fieldClass} name={name} value={value || ""} onChange={onChange} required><option value="">Select</option>{children}</select></label>; }

export default function OnboardingFlow() {
  const params = useSearchParams();
  const requested = params.get("step");
  const initialIndex = Math.max(0, steps.findIndex(([id]) => id === requested));
  const [index, setIndex] = useState(initialIndex);
  const [form, setForm] = useState({ otp:"", phoneNumber:"", pan:"", consent:false, dateOfBirth:"", gender:"", occupation:"", annualIncomeBand:"", city:"", state:"", pincode:"", horizonScore:3, lossToleranceScore:3, incomeStabilityScore:3, experienceScore:3, preferredPlan:"direct", sipDay:5, goalName:"", accountNumber:"", ifsc:"", accountHolderName:"", nomineeName:"", relationship:"", fatca:false, taxResidencyCountry:"", isUsPerson:false, isUsCitizen:false, pep:"" });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const { data, loading, error, refresh, api } = useInvestData();
  const [stepId, stepName] = steps[index];
  const item = data?.compliance?.items?.find(i => i.item_key === stepId);
  useEffect(() => {
    if (requested || !data?.compliance?.items?.length) return;
    const firstIncomplete = steps.findIndex(([id]) => {
      const current = data.compliance.items.find(entry => entry.item_key === id);
      return current && !["verified", "completed"].includes(current.status);
    });
    if (firstIncomplete >= 0 && firstIncomplete !== index) setIndex(firstIncomplete);
  }, [data, index, requested]);
  useEffect(() => {
    const profile = data?.profile;
    if (!profile) return;
    setForm(current => ({ ...current,
      dateOfBirth: current.dateOfBirth || profile.date_of_birth || "",
      gender: current.gender || profile.gender || "",
      occupation: current.occupation || profile.occupation || "",
      annualIncomeBand: current.annualIncomeBand || profile.annual_income_band || "",
      city: current.city || profile.city || "", state: current.state || profile.state || "", pincode: current.pincode || profile.pincode || "",
    }));
  }, [data?.profile]);
  const update = e => { const {name, value, type, checked} = e.target; setForm(f => ({...f, [name]: type === "checkbox" ? checked : value})); setNotice(""); };
  const content = useMemo(() => ({
    profile: ["Tell us about you", "Used to establish suitability and complete your investor record."], mobile: ["Verify your mobile", "In this mock environment, use OTP 123456. Real delivery is not active."], email: ["Verify your email", "In this mock environment, use OTP 123456. Real delivery is not active."],
    pan: ["Verify your PAN", "The mock KYC provider returns a simulated verification outcome."], identity: ["Confirm your identity", "Your consent is recorded before the mock document provider is called."],
    risk_profile: ["Understand your risk profile", "Four simple questions produce a provisional profile for this mock phase."], preferences: ["Shape your investment plan", "Choose how you prefer to invest and name the goal you are working toward."],
    bank: ["Verify your bank", "Used for future payments and redemptions. This phase runs a simulated penny-drop check."], nominee: ["Add a nominee", "Helps your investments reach the person you choose."], fatca: ["Complete your declaration", "Confirm your FATCA declaration to finish investment readiness."],
    pep: ["Politically exposed person screening", "A required regulatory declaration. Most investors answer no and complete this instantly."],
  }), []);

  async function submit(e) {
    e.preventDefault(); setSaving(true); setNotice("");
    try {
      let result;
      if (stepId === "profile") result = await api.updateProfile({ dateOfBirth:form.dateOfBirth, gender:form.gender, occupation:form.occupation, annualIncomeBand:form.annualIncomeBand, city:form.city, state:form.state, pincode:form.pincode });
      else if (stepId === "risk_profile") { await api.updateRiskProfile({ horizonScore:Number(form.horizonScore), lossToleranceScore:Number(form.lossToleranceScore), incomeStabilityScore:Number(form.incomeStabilityScore), experienceScore:Number(form.experienceScore) }); result = await api.submitCompliance("risk_profile", {}); }
      else if (stepId === "preferences") result = await api.updatePreferences({ preferredPlan:form.preferredPlan, sipDay:Number(form.sipDay), goals:form.goalName ? [{name:form.goalName}] : [] });
      else {
        const payload = stepId === "mobile" ? {otp:form.otp, phoneNumber:form.phoneNumber} : stepId === "email" ? {otp:form.otp} : stepId === "pan" ? {pan:form.pan} : stepId === "identity" ? {pan:form.pan, consentToken:form.consent ? `consent-${Date.now()}` : ""} : stepId === "bank" ? {accountNumber:form.accountNumber, ifsc:form.ifsc, accountHolderName:form.accountHolderName} : stepId === "nominee" ? {name:form.nomineeName, relationship:form.relationship, allocationPct:100, minor:false} : stepId === "pep" ? {declared:form.pep === "yes"} : {declared:form.fatca, taxResidencyCountry:form.taxResidencyCountry, isUsPerson:form.isUsPerson, isUsCitizen:form.isUsCitizen};
        result = await api.submitCompliance(stepId, payload);
        if (stepId === "fatca" && result.overallStatus === "completed") {
          await api.openAccount();
        }
      }
      await refresh();
      setNotice("Saved securely. You can continue or return later.");
      if (!result?.item || ["verified", "completed"].includes(result.item.status)) setIndex(current => Math.min(steps.length - 1, current + 1));
    } catch (e2) { setNotice(e2.message); }
    finally { setSaving(false); }
  }

  return <InvestShell eyebrow="Guided onboarding" title={content[stepId][0]} description={content[stepId][1]}>
    {loading ? <LoadingCards /> : error ? <ErrorCard message={error} retry={refresh} /> : <div className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)]">
      <Card className="h-fit p-3"><div className="flex gap-2 overflow-x-auto xl:grid" aria-label="Onboarding progress">{steps.map(([id,name], i) => { const ci=data?.compliance?.items?.find(x=>x.item_key===id); const completed = id === "profile" ? Boolean(data?.profile) : id === "preferences" ? Boolean(data?.preferences) : ["verified","completed"].includes(ci?.status); return <button type="button" key={id} onClick={()=>{setIndex(i);setNotice("");}} className={`flex min-w-[150px] items-center gap-3 rounded-2xl p-3 text-left text-sm font-semibold xl:min-w-0 ${i===index ? "bg-ink text-bg" : "text-ink-muted hover:bg-surface-2"}`}><span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs ${completed ? "bg-pos text-white" : i===index ? "bg-bg/15" : "bg-surface-2"}`}>{completed ? "✓" : i+1}</span>{name}</button>})}</div></Card>
      <Card className="overflow-hidden"><div className="border-b border-line p-5 sm:p-7"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-xs font-semibold text-ink-faint">Step {index+1} of {steps.length} · {data?.compliance?.completed || 0} of {data?.compliance?.total || 9} checks complete</div><div className="mt-3 h-2 max-w-xl overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${data?.compliance?.percent || 0}%` }} /></div><h2 className="mt-4 text-2xl font-semibold tracking-[-.04em] text-ink">{stepName}</h2></div>{item && <StatusPill status={item.status} />}</div></div>
        <form onSubmit={submit} className="p-5 sm:p-7">
          {stepId === "profile" && <div className="grid gap-5 sm:grid-cols-2"><Field label="Date of birth" name="dateOfBirth" type="date" value={form.dateOfBirth} onChange={update}/><Select label="Gender" name="gender" value={form.gender} onChange={update}><option>Female</option><option>Male</option><option>Non-binary</option><option>Prefer not to say</option></Select><Field label="Occupation" name="occupation" value={form.occupation} onChange={update}/><Select label="Annual income" name="annualIncomeBand" value={form.annualIncomeBand} onChange={update}><option value="below-5l">Below ₹5 lakh</option><option value="5l-10l">₹5–10 lakh</option><option value="10l-25l">₹10–25 lakh</option><option value="above-25l">Above ₹25 lakh</option></Select><Field label="City" name="city" value={form.city} onChange={update}/><Field label="State" name="state" value={form.state} onChange={update}/><Field label="PIN code" name="pincode" value={form.pincode} onChange={update}/></div>}
          {stepId === "mobile" && <div className="grid max-w-md gap-5"><Field label="Mobile number" name="phoneNumber" type="tel" placeholder="+91 98765 43210" value={form.phoneNumber} onChange={update}/><Field label="Verification code" name="otp" inputMode="numeric" placeholder="Use 123456 in mock mode" value={form.otp} onChange={update}/></div>}
          {stepId === "email" && <div className="max-w-md"><Field label="Verification code" name="otp" inputMode="numeric" placeholder="Use 123456 in mock mode" value={form.otp} onChange={update}/></div>}
          {stepId === "pan" && <div className="max-w-md"><Field label="Permanent Account Number" name="pan" placeholder="ABCDE1234F" value={form.pan} onChange={update}/></div>}
          {stepId === "identity" && <div className="max-w-xl space-y-5"><Field label="PAN used for identity check" name="pan" placeholder="ABCDE1234F" value={form.pan} onChange={update}/><label className="flex gap-3 rounded-2xl bg-surface-2 p-4 text-sm leading-6 text-ink-muted"><input type="checkbox" name="consent" checked={form.consent} onChange={update} required className="mt-1 h-5 w-5 accent-[rgb(var(--color-brand))]"/><span>I consent to the mock identity provider retrieving a simulated identity document for this verification.</span></label></div>}
          {stepId === "risk_profile" && <div className="grid gap-5 sm:grid-cols-2">{[["Investment horizon","horizonScore","1 = under 1 year · 5 = 10+ years"],["Comfort with market falls","lossToleranceScore","1 = very low · 5 = very high"],["Income stability","incomeStabilityScore","1 = variable · 5 = highly stable"],["Investment experience","experienceScore","1 = new · 5 = experienced"]].map(([l,n,h])=><label key={n} className={labelClass}>{l}<input type="range" min="1" max="5" name={n} value={form[n]} onChange={update} className="mt-4 w-full accent-[rgb(var(--color-brand))]"/><span className="mt-2 flex justify-between text-[11px] text-ink-faint"><span>{h}</span><strong className="text-ink">{form[n]}/5</strong></span></label>)}</div>}
          {stepId === "preferences" && <div className="grid gap-5 sm:grid-cols-2"><Select label="Preferred plan" name="preferredPlan" value={form.preferredPlan} onChange={update}><option value="direct">Direct</option><option value="regular">Regular</option></Select><Field label="Preferred SIP day" name="sipDay" type="number" value={form.sipDay} onChange={update}/><div className="sm:col-span-2"><Field label="First financial goal" name="goalName" value={form.goalName} onChange={update} placeholder="For example: Home deposit" required={false}/></div></div>}
          {stepId === "bank" && <div className="grid gap-5 sm:grid-cols-2"><Field label="Account holder name" name="accountHolderName" value={form.accountHolderName} onChange={update}/><Field label="Account number" name="accountNumber" value={form.accountNumber} onChange={update}/><Field label="IFSC" name="ifsc" value={form.ifsc} onChange={update}/></div>}
          {stepId === "nominee" && <div className="grid gap-5 sm:grid-cols-2"><Field label="Nominee full name" name="nomineeName" value={form.nomineeName} onChange={update}/><Select label="Relationship" name="relationship" value={form.relationship} onChange={update}><option>Spouse</option><option>Parent</option><option>Child</option><option>Sibling</option><option>Other</option></Select></div>}
          {stepId === "fatca" && <div className="max-w-2xl space-y-5">
            <div className="max-w-xs"><Field label="Country of tax residence" name="taxResidencyCountry" placeholder="IN" value={form.taxResidencyCountry} onChange={update}/><p className="mt-1.5 text-xs text-ink-faint">ISO 2-letter country code, for example IN, US, GB.</p></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex gap-3 rounded-2xl bg-surface-2 p-4 text-sm leading-6 text-ink-muted"><input type="checkbox" name="isUsPerson" checked={form.isUsPerson} onChange={update} className="mt-1 h-5 w-5 accent-[rgb(var(--color-brand))]"/><span>I am a US person for tax purposes.</span></label>
              <label className="flex gap-3 rounded-2xl bg-surface-2 p-4 text-sm leading-6 text-ink-muted"><input type="checkbox" name="isUsCitizen" checked={form.isUsCitizen} onChange={update} className="mt-1 h-5 w-5 accent-[rgb(var(--color-brand))]"/><span>I am a US citizen.</span></label>
            </div>
            <label className="flex gap-3 rounded-2xl bg-surface-2 p-5 text-sm leading-6 text-ink-muted"><input type="checkbox" name="fatca" checked={form.fatca} onChange={update} required className="mt-1 h-5 w-5 accent-[rgb(var(--color-brand))]"/><span>I confirm that my tax-residency details are accurate and I agree to provide additional information if required.</span></label>
          </div>}
          {stepId === "pep" && <div className="max-w-2xl space-y-5">
            <p className="text-sm leading-6 text-ink-muted">A Politically Exposed Person (PEP) holds, or has held, a prominent public position — for example a government minister, judge, senior military officer, or a senior executive at a state-owned enterprise — or is a close family member or known associate of such a person.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex gap-3 rounded-2xl bg-surface-2 p-4 text-sm leading-6 text-ink-muted"><input type="radio" name="pep" value="no" checked={form.pep === "no"} onChange={update} required className="mt-1 h-5 w-5 accent-[rgb(var(--color-brand))]"/><span>No — I am not a PEP, and have no close family member or known associate who is.</span></label>
              <label className="flex gap-3 rounded-2xl bg-surface-2 p-4 text-sm leading-6 text-ink-muted"><input type="radio" name="pep" value="yes" checked={form.pep === "yes"} onChange={update} required className="mt-1 h-5 w-5 accent-[rgb(var(--color-brand))]"/><span>Yes — I am a PEP, or a close family member or known associate of one.</span></label>
            </div>
            <p className="text-xs text-ink-faint">A &ldquo;yes&rdquo; answer is not a barrier to investing — it routes to manual review rather than automatic completion, since this platform cannot auto-clear a self-declared PEP.</p>
          </div>}
          {notice && <p role="status" className={`mt-5 rounded-2xl p-4 text-sm ${notice.startsWith("Saved") ? "bg-pos/10 text-pos" : "bg-neg/10 text-neg"}`}>{notice}</p>}
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5"><button type="button" disabled={index===0} onClick={()=>{setIndex(i=>Math.max(0,i-1));setNotice("");}} className="min-h-11 rounded-full border border-line px-5 text-sm font-semibold text-ink disabled:opacity-35">Back</button><button type="submit" disabled={saving} className="min-h-11 rounded-full bg-ink px-6 text-sm font-semibold text-bg disabled:opacity-50">{saving ? "Saving…" : "Save and continue"}</button></div>
        </form>
      </Card>
    </div>}
  </InvestShell>;
}
