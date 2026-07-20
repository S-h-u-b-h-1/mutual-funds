"use client";

export default function InvestError({ reset }) {
  return <main className="grid min-h-[70dvh] place-items-center bg-bg px-5 py-16"><section role="alert" className="w-full max-w-lg rounded-[1.8rem] border border-neg/20 bg-surface p-7 text-center shadow-float"><div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-neg/10 text-neg" aria-hidden="true">!</div><h1 className="mt-5 text-2xl font-semibold tracking-[-.04em] text-ink">Invest workspace unavailable</h1><p className="mt-3 text-sm leading-6 text-ink-muted">We could not load this secure view. Your saved records were not changed.</p><button type="button" onClick={() => reset()} className="mt-6 min-h-11 rounded-full bg-ink px-5 text-sm font-semibold text-bg">Try again</button></section></main>;
}
