"use client";
import { useRef, useState } from "react";
import { track } from "../lib/track";
import { SUPA } from "../lib/supabase";

export default function Search() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
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
        setOpen(true);
        track("search", { q: clean, results: Array.isArray(rows) ? rows.length : 0 });
      } catch {
        setResults([]);
      }
    }, 350);
  }

  return (
    <div className="search">
      <input
        className="search-input"
        placeholder="Search 14,000+ schemes or an AMC…"
        value={q}
        onChange={onChange}
        onFocus={() => results.length && setOpen(true)}
      />
      {open && results.length > 0 && (
        <ul className="search-results">
          {results.map((r) => (
            <li key={r.scheme_code}>
              <a
                href={`/amc/${encodeURIComponent(r.amc_name)}`}
                onClick={() => track("search_click", { scheme_code: r.scheme_code, amc: r.amc_name })}
              >
                <span className="sr-name">{r.scheme_name}</span>
                <span className="sr-meta">
                  {r.amc_name.replace(" Mutual Fund", "")} · {r.asset_class}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {open && results.length === 0 && q.trim().length >= 2 && (
        <ul className="search-results">
          <li className="sr-empty">No matches for “{q.trim()}”.</li>
        </ul>
      )}
    </div>
  );
}
