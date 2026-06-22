"use client";
import { useEffect, useState } from "react";
import { SUPA } from "../lib/supabase";

const KEY = "mfp_watchlist";

export default function Watchlist() {
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

  return (
    <section className="panel">
      <h2>★ Your watchlist · {items.length}</h2>
      <ul className="watchlist">
        {items.map((i) => (
          <li key={i.code}>
            <span className="wl-name">{i.name}</span>
            <span className="wl-nav">{navs[i.code] ? `₹${Number(navs[i.code].nav_value).toFixed(2)}` : "—"}</span>
            <button className="wl-del" onClick={() => remove(i.code)} aria-label="Remove">✕</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
