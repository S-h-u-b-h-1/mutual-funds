"use client";
import { track } from "../lib/track";

// Receives a pre-built CSV string (server-built, fully serializable) and offers a
// client-ready download + logs an `export` event (collection coverage).
export default function ExportCsv({ csv, filename, report }) {
  function download() {
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    track("export", { report });
  }

  return (
    <button
      onClick={download}
      className="rounded-lg border border-line-strong bg-white/[0.04] px-3 py-1.5 text-[12px] font-medium text-ink-muted transition-colors hover:text-ink"
    >
      ↓ Export CSV
    </button>
  );
}
