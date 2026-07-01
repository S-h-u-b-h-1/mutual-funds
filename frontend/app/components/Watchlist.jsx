"use client";
import { useEffect, useState } from "react";
import { SUPA } from "../lib/supabase";
import SectionHeader from "./ui/SectionHeader";

const KEY = "mfp_watchlist";

export default function Watchlist({ amcDeltas = {} }) {
  const [items, setItems] = useState([]);
  const [navs, setNavs] = useState({});

  function load() {
    try { setItems(JSON.parse(localStorage.getItem(KEY) || "[]")); } catch { setItems([]); }
  }

  useEffect(() => {
    load();
    const h = () => load();
    window.addEventListener("mfp-watchlist", h);
    window.addEventListener("storage", h);
    return () => {
      window.removeEventListener("mfp-watchlist", h);
      window.removeEventListener("storage", h);
    };
  }, []);

  useEffect(() => {
    if (!items.length) { setNavs({}); return; }
    const codes = items.map((i) => i.code).join(",");
    fetch(
      `${SUPA.URL}/rest/v1/fact_nav_daily?scheme_code=in.(${codes})&select=scheme_code,nav_value,nav_date&order=nav_date.desc`,
      { headers: { apikey: SUPA.KEY, Authorization: `Bearer ${SUPA.KEY}` } }
    )
      .then((r) => r.json())
      .then((rows) => {
        const m = {};
        for (const r of rows || []) if (!m[r.scheme_code]) m[r.scheme_code] = r;
        setNavs(m);
      })
      .catch(() => {});
  }, [items]);

  function remove(code) {
    const next = items.filter((i) => i.code !== code);
    localStorage.setItem(KEY, JSON.stringify(next));
    setItems(next);
    window.dispatchEvent(new Event("mfp-watchlist"));
  }

  if (!items.length) return null;

  // Watchlist intelligence: aggregate over watched schemes' AMCs (real 30d index).
  const amcs = [...new Set(items.map((i) => i.amc).filter(Boolean))];
  const deltas = amcs.map((a) => amcDeltas[a]).filter((d) => d != null);
  const avgDelta = deltas.length ? deltas.reduce((s, d) => s + d, 0) / deltas.length : null;

  return (
    <section className="mt-8" id="watchlist">
      <SectionHeader
        eyebrow="Saved · your funds"
        title={`★ Watchlist · ${items.length}`}
        action={
          <span className="flex items-center gap-3">
            <span>{amcs.length} AMCs</span>
            {avgDelta != null && (
              <span className={avgDelta >= 0 ? "text-pos" : "text-neg"}>
                avg 30d {avgDelta >= 0 ? "+" : ""}{avgDelta.toFixed(2)}
              </span>
            )}
          </span>
        }
      />
      <div className="glass divide-y divide-line px-5">
        {items.map((i) => (
          <div key={i.code} className="flex items-center gap-3 py-3 text-[13px]">
            <span className="flex-1 truncate text-ink">{i.name}</span>
            <span className="tnum font-bold text-pos">
              {navs[i.code] ? `₹${Number(navs[i.code].nav_value).toFixed(2)}` : "—"}
            </span>
            <button onClick={() => remove(i.code)} aria-label="Remove" className="text-ink-faint hover:text-neg transition-colors">
              ✕
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
