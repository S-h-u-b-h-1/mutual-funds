"use client";
import { useEffect, useRef, useState } from "react";
import { track } from "../lib/track";
import { recordSearch, getRecentSearches } from "../lib/sessionMemory";
import { SUPA } from "../lib/supabase";

// World-class search (Phase 8): fund / AMC / category / benchmark / manager / ISIN / scheme
// code, all real (server-side, via /api/search — see that route for why: funds.json/
// metadata.json carry benchmark+manager fields Supabase's dim_scheme doesn't have). Recent
// searches are local (sessionMemory); popular searches are a real v_top_searches aggregate,
// fetched once — never fabricated, and honestly absent if there isn't enough activity yet.
export default function Search() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState([]);
  const [popular, setPopular] = useState([]);
  const timer = useRef(null);
  const reqId = useRef(0); // guards against a slower earlier response overwriting a faster later one

  useEffect(() => {
    setRecent(getRecentSearches(6));
    fetch(`${SUPA.URL}/rest/v1/v_top_searches?select=query,searches&limit=6`, { headers: { apikey: SUPA.KEY, Authorization: `Bearer ${SUPA.KEY}` } })
      .then((r) => r.json()).then((d) => setPopular(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  function runSearch(term) {
    setQ(term);
    fetchResults(term);
  }

  function fetchResults(term) {
    clearTimeout(timer.current);
    const clean = term.trim();
    if (clean.length < 2) {
      setResults([]);
      setOpen(true); // still open — shows recent/popular
      return;
    }
    setLoading(true);
    setOpen(true);
    const myReq = ++reqId.current;
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(clean)}`);
        const { results: hits } = await res.json();
        if (myReq !== reqId.current) return; // a newer query's response already landed — drop this stale one
        setResults(hits || []);
        track("search", { q: clean, results: hits?.length || 0 });
        if (hits?.length > 0) { recordSearch(clean); setRecent(getRecentSearches(6)); }
      } catch {
        if (myReq === reqId.current) setResults([]);
      } finally {
        if (myReq === reqId.current) setLoading(false);
      }
    }, 320);
  }

  const showSuggestions = open && q.trim().length < 2 && (recent.length > 0 || popular.length > 0);

  return (
    <div className="relative">
      <input
        className="w-full rounded-2xl border border-line-strong bg-white/[0.03] py-3.5 pl-12 pr-4 text-[15px] text-ink placeholder:text-ink-faint outline-none transition-shadow focus:border-accent focus:ring-4 focus:ring-accent/15"
        placeholder="Search by fund, AMC, category, benchmark, manager, ISIN, or scheme code…"
        value={q}
        onChange={(e) => { setQ(e.target.value); fetchResults(e.target.value); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18' fill='none' stroke='%238b93a7' stroke-width='2'%3E%3Ccircle cx='8' cy='8' r='6'/%3E%3Cpath d='M13 13l4 4'/%3E%3C/svg%3E\")",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "16px center",
        }}
      />
      {open && (
        <ul className="absolute left-0 right-0 z-30 mt-2 rounded-2xl border border-line-strong bg-[#0c1120] p-1.5 shadow-glass">
          {showSuggestions && (
            <>
              {recent.length > 0 && (
                <li className="px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-faint">Recent searches</li>
              )}
              {recent.map((s) => (
                <li key={`r-${s}`}>
                  {/* preventDefault on mousedown stops the input from ever blurring, so the
                      dropdown never races its own onBlur-close against the search fetch. */}
                  <button onMouseDown={(e) => { e.preventDefault(); runSearch(s); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px] text-ink-muted transition-colors hover:bg-white/[0.05] hover:text-ink">
                    <span className="text-ink-faint">↺</span> {s}
                  </button>
                </li>
              ))}
              {popular.length > 0 && (
                <li className="mt-1 border-t border-line px-3 pt-2 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-faint">Popular searches</li>
              )}
              {popular.map((p) => (
                <li key={`p-${p.query}`}>
                  <button onMouseDown={(e) => { e.preventDefault(); runSearch(p.query); }} className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-[13px] text-ink-muted transition-colors hover:bg-white/[0.05] hover:text-ink">
                    <span><span className="text-ink-faint">↗</span> {p.query}</span>
                    <span className="text-[10.5px] text-ink-faint">{p.searches}</span>
                  </button>
                </li>
              ))}
            </>
          )}
          {q.trim().length >= 2 && loading && <li className="px-3 py-2.5 text-[13px] text-ink-faint">Searching…</li>}
          {q.trim().length >= 2 && !loading && results.length === 0 && (
            <li className="px-3 py-2.5 text-[13px] text-ink-muted">No matches for “{q.trim()}”.</li>
          )}
          {!loading &&
            results.map((r) => (
              <li key={r.code}>
                <a
                  href={`/fund/${r.code}`}
                  onClick={() => track("search_click", { scheme_code: r.code, amc: r.amc })}
                  className="flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 transition-colors hover:bg-white/[0.05]"
                >
                  <span className="flex flex-col gap-0.5">
                    <span className="text-[13px] text-ink">{r.name}</span>
                    <span className="text-[11px] text-ink-muted">{r.amc} · {r.category}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {r.matchType && r.matchType !== "Fund name" && <span className="rounded-full border border-line px-2 py-0.5 text-[10px] text-ink-faint">{r.matchType}</span>}
                    {r.variantCount > 1 && <span className="rounded-full border border-line px-2 py-0.5 text-[10px] text-ink-faint">{r.variantCount} variants</span>}
                  </span>
                </a>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
