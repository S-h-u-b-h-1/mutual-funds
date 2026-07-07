"use client";
import { useEffect, useState } from "react";
import { getAllNotes } from "../lib/sessionMemory";

// Research Dashboard building block (Personal Operating System sprint) — the notebook's own
// overview, reading the same mfp_research_notes key ResearchNotes.jsx writes to on every fund
// page. Renders nothing for a visitor who has never saved a note (no fabricated empty state).
export default function NotebookPreview() {
  const [notes, setNotes] = useState([]);

  useEffect(() => {
    function refresh() { setNotes(getAllNotes(5)); }
    refresh();
    window.addEventListener("mfp-session", refresh);
    return () => window.removeEventListener("mfp-session", refresh);
  }, []);

  if (!notes.length) return null;

  return (
    <div className="space-y-2">
      {notes.map((n) => (
        <a key={n.id} href={`/fund/${n.code}`} className="block rounded-lg border border-line bg-white/[0.015] px-3.5 py-2.5 text-[12.5px] transition-colors hover:bg-white/[0.04]">
          <div className="flex items-center justify-between gap-3">
            <span className="truncate font-medium text-ink">{n.fundName || n.code}</span>
            <span className="shrink-0 text-ink-faint">{new Date(n.at).toLocaleDateString("en-IN")}</span>
          </div>
          <p className="mt-0.5 truncate text-ink-muted">{n.text}</p>
        </a>
      ))}
    </div>
  );
}
