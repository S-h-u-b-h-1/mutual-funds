"use client";
import { useRef, useState } from "react";
import { track } from "../lib/track";
import { SUPA } from "../lib/supabase";

export default function Search() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef(null);

  function onChange(e) {
    const v = e.target.value;
    setQ(v);
    clearTimeout(timer.current);
    const clean = v.trim().replace(/[%*(),]/g, " ").trim();
    if (clean.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    setOpen(true);
    timer.current = setTimeout(async () => {
      const term = encodeURIComponent(`*${clean}*`);
      const filter = `or=(scheme_name.ilike.${term},amc_name.ilike.${term})`;
      try {
        const res = await fetch(
          `${SUPA.URL}/rest/v1/dim_scheme?select=scheme_code,scheme_name,amc_name,asset_class&${filter}&limit=8`,
          { headers: { apikey: SUPA.KEY, Authorization: `Bearer ${SUPA.KEY}` } }
        );
        const rows = await res.json();
        setResults(Array.isArray(rows) ? rows : []);
        track("search", { q: clean, results: Array.isArray(rows) ? rows.length : 0 });
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 320);
  }

  return (
    <div className="relative">
      <input
        className="w-full rounded-2xl border border-line-strong bg-white/[0.03] py-3.5 pl-12 pr-4 text-[15px] text-ink placeholder:text-ink-faint outline-none transition-shadow focus:border-accent focus:ring-4 focus:ring-accent/15"
        placeholder="Search 14,000+ schemes or an AMC…"
        value={q}
        onChange={onChange}
        onFocus={() => results.length && setOpen(true)}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18' fill='none' stroke='%238b93a7' stroke-width='2'%3E%3Ccircle cx='8' cy='8' r='6'/%3E%3Cpath d='M13 13l4 4'/%3E%3C/svg%3E\")",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "16px center",
        }}
      />
      {open && (
        <ul className="absolute left-0 right-0 z-30 mt-2 rounded-2xl border border-line-strong bg-[#0c1120] p-1.5 shadow-glass">
          {loading && <li className="px-3 py-2.5 text-[13px] text-ink-faint">Searching…</li>}
          {!loading && results.length === 0 && q.trim().length >= 2 && (
            <li className="px-3 py-2.5 text-[13px] text-ink-muted">No matches for “{q.trim()}”.</li>
          )}
          {!loading &&
            results.map((r) => (
              <li key={r.scheme_code}>
                <a
                  href={`/fund/${r.scheme_code}`}
                  onClick={() => track("search_click", { scheme_code: r.scheme_code, amc: r.amc_name })}
                  className="flex flex-col gap-0.5 rounded-xl px-3 py-2.5 transition-colors hover:bg-white/[0.05]"
                >
                  <span className="text-[13px] text-ink">{r.scheme_name}</span>
                  <span className="text-[11px] text-ink-muted">
                    {r.amc_name.replace(" Mutual Fund", "")} · {r.asset_class}
                  </span>
                </a>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
