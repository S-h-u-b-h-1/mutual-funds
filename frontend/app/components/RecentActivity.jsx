"use client";
import { useEffect, useState } from "react";
import { getHistory, lastVisited, preferredCategories, preferredAmcs } from "../lib/cloudSync";

// amc's `id` is already the full "X Mutual Fund" DB-form name (amc/[amc]/page.js's `amc` const,
// per every URL builder in the app) — do NOT re-append the suffix here, that would double it.
const PATH = {
  fund: (id) => `/fund/${id}`, amc: (id) => `/amc/${encodeURIComponent(id)}`, category: (id) => `/categories/${encodeURIComponent(id)}`,
  manager: (id) => `/manager/${id}`, benchmark: (id) => `/benchmark/${id}`,
};
const LABEL = { fund: "Fund", amc: "AMC", category: "Category", manager: "Manager", benchmark: "Benchmark" };

// Session/history intelligence (Phase 4; cloud-synced when signed in) — renders nothing for a
// first-time visitor (no history yet); for a returning one, shows exactly what they looked at,
// nothing inferred as fact beyond "you viewed this N times."
export default function RecentActivity() {
  const [last, setLast] = useState(null);
  const [recent, setRecent] = useState([]);
  const [prefs, setPrefs] = useState([]);
  const [amcPrefs, setAmcPrefs] = useState([]);

  useEffect(() => {
    function refresh() {
      lastVisited().then(setLast);
      getHistory({ limit: 8 }).then(setRecent);
      preferredCategories(3).then(setPrefs);
      preferredAmcs(3).then(setAmcPrefs);
    }
    refresh();
    window.addEventListener("mfp-sync", refresh);
    return () => window.removeEventListener("mfp-sync", refresh);
  }, []);

  if (!recent.length) return null; // first-time visitor — nothing to show, no clutter

  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Welcome back</div>
          <h2 className="mt-1 text-[17px] font-semibold tracking-tight text-ink">Continue where you left off</h2>
        </div>
        {(prefs.length > 0 || amcPrefs.length > 0) && (
          <div className="text-[11.5px] text-ink-faint">
            {prefs.length > 0 && <>You&rsquo;ve been looking at <span className="text-ink-muted">{prefs.map((p) => p.category).join(", ")}</span> funds</>}
            {prefs.length > 0 && amcPrefs.length > 0 && " · "}
            {amcPrefs.length > 0 && <>most researched: <span className="text-ink-muted">{amcPrefs.map((p) => p.amc).join(", ")}</span></>}
          </div>
        )}
      </div>
      {last && (
        <a href={PATH[last.type]?.(last.id) || "/"} className="glass mb-2.5 flex items-center justify-between gap-3 p-4 transition-colors hover:bg-white/[0.045]">
          <span>
            <span className="text-[11px] uppercase tracking-[0.08em] text-ink-faint">Last viewed · {LABEL[last.type]}</span>
            <span className="mt-0.5 block text-[13.5px] font-semibold text-ink">{last.name}</span>
          </span>
          <span className="shrink-0 text-[12px] text-accent-soft">Resume →</span>
        </a>
      )}
      <div className="flex flex-wrap gap-2">
        {recent.slice(1, 8).map((v) => (
          <a key={`${v.type}-${v.id}`} href={PATH[v.type]?.(v.id) || "/"} className="rounded-full border border-line px-3 py-1.5 text-[12px] text-ink-muted transition-colors hover:border-line-strong hover:text-ink">
            {v.name}
          </a>
        ))}
      </div>
    </section>
  );
}
