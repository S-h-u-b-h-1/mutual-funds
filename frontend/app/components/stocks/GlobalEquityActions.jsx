"use client";

export default function GlobalEquityActions() {
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <button type="button" onClick={() => window.print()} className="rounded-full border border-line px-4 py-2 text-xs font-semibold text-ink-muted transition hover:border-accent/40 hover:text-ink">Print / save report</button>
      <button type="button" onClick={() => navigator.clipboard.writeText(window.location.href)} className="rounded-full border border-line px-4 py-2 text-xs font-semibold text-ink-muted transition hover:border-accent/40 hover:text-ink">Copy research link</button>
    </div>
  );
}
