"use client";
import { useEffect, useState } from "react";
import { getComparisons } from "../lib/cloudSync";

// Research Dashboard building block (Decision Support sprint) — reads the same comparisons
// CompareClient.jsx writes on "Save workspace" (cloud-synced when signed in); renders nothing
// for a visitor who has never saved a comparison (no clutter, no fabricated "0" state).
export default function SavedComparisons() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    function refresh() { getComparisons().then((list) => setItems(list.slice(0, 5))); }
    refresh();
    window.addEventListener("mfp-sync", refresh);
    return () => window.removeEventListener("mfp-sync", refresh);
  }, []);

  if (!items.length) return null;

  return (
    <div className="space-y-2">
      {items.map((c) => (
        <a
          key={c.name}
          href={`/compare?amcs=${c.amcs.map(encodeURIComponent).join(",")}`}
          className="flex items-center justify-between gap-3 rounded-lg border border-line bg-white/[0.015] px-3.5 py-2.5 text-[12.5px] transition-colors hover:bg-white/[0.04]"
        >
          <span className="truncate text-ink-muted">
            <span className="font-medium text-ink">{c.name}</span> · {c.amcs.length} AMCs
          </span>
          <span className="shrink-0 text-ink-faint">{new Date(c.at).toLocaleDateString("en-IN")}</span>
        </a>
      ))}
    </div>
  );
}
