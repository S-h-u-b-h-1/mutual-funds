"use client";

import { useEffect, useState } from "react";

export default function BriefActions({ date }) {
  const [reviewed, setReviewed] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    try { setReviewed(localStorage.getItem(`mfp-brief-reviewed-${date}`) === "1"); } catch {}
  }, [date]);

  function toggleReviewed() {
    const next = !reviewed;
    setReviewed(next);
    try { localStorage.setItem(`mfp-brief-reviewed-${date}`, next ? "1" : "0"); } catch {}
    setStatus(next ? "Brief marked reviewed." : "Brief returned to your queue.");
  }

  async function shareBrief() {
    const data = { title: "MF Pulse Morning Brief", text: `MF Pulse research brief for ${date}`, url: window.location.href };
    try {
      if (navigator.share) await navigator.share(data);
      else { await navigator.clipboard.writeText(window.location.href); setStatus("Brief link copied."); }
    } catch (error) {
      if (error?.name !== "AbortError") setStatus("Sharing is unavailable in this browser.");
    }
  }

  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      <button type="button" onClick={toggleReviewed} aria-pressed={reviewed} className={`min-h-10 rounded-xl border px-3.5 text-xs font-semibold ${reviewed ? "border-pos/40 bg-pos/10 text-pos" : "border-line text-ink"}`}>{reviewed ? "Reviewed" : "Mark reviewed"}</button>
      <button type="button" onClick={() => window.print()} className="min-h-10 rounded-xl border border-line px-3.5 text-xs font-semibold text-ink">Print</button>
      <button type="button" onClick={shareBrief} className="min-h-10 rounded-xl border border-line px-3.5 text-xs font-semibold text-ink">Share</button>
      {status && <span className="text-xs text-ink-muted" role="status">{status}</span>}
    </div>
  );
}
