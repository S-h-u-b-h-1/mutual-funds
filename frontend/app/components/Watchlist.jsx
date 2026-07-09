"use client";
import { useEffect, useState } from "react";
import { SUPA } from "../lib/supabase";
import SectionHeader from "./ui/SectionHeader";
import { getWatchlist, removeFromWatchlist } from "../lib/cloudSync";

export default function Watchlist({ amcDeltas = {} }) {
  const [items, setItems] = useState([]);
  const [navs, setNavs] = useState({});

  useEffect(() => {
    let live = true;
    const load = () => getWatchlist().then((list) => { if (live) setItems(list); });
    load();
    window.addEventListener("mfp-sync", load);
    window.addEventListener("storage", load);
    return () => {
      live = false;
      window.removeEventListener("mfp-sync", load);
      window.removeEventListener("storage", load);
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
    setItems((prev) => prev.filter((i) => i.code !== code)); // optimistic
    removeFromWatchlist(code);
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
            <a className="flex-1 truncate text-ink hover:text-accent-soft" href={`/fund/${i.code}`}>{i.name}</a>
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
