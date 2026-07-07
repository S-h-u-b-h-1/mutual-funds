"use client";
import { useEffect, useState } from "react";
import { track } from "../lib/track";
import { saveNote, getNotes, deleteNote } from "../lib/sessionMemory";

// Research Notebook (Personal Operating System sprint, Phase 3) — the user's own observations
// against this specific fund, kept exactly as typed, never scored or summarised. Local-only
// today (mfp_research_notes); the storage shape (per-code array of {id, text, at}) is already
// what a future login-sync would need — no rework, just a different read/write target.
export default function ResearchNotes({ code, name }) {
  const [notes, setNotes] = useState([]);
  const [draft, setDraft] = useState("");

  function refresh() { setNotes(getNotes(code)); }
  useEffect(() => { refresh(); }, [code]);

  function submit(e) {
    e.preventDefault();
    if (!draft.trim()) return;
    saveNote(code, draft, name);
    setDraft("");
    refresh();
    track("research_note_save", { scheme_code: code });
  }

  function remove(id) {
    deleteNote(code, id);
    refresh();
  }

  return (
    <div>
      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Save an observation about this fund — visible only to you, on this browser…"
          rows={2}
          className="flex-1 rounded-xl border border-line-strong bg-white/[0.03] px-3.5 py-2.5 text-[13px] text-ink placeholder:text-ink-faint outline-none focus:border-accent resize-none"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="shrink-0 rounded-xl border border-accent/40 bg-accent/15 px-4 py-2.5 text-[12.5px] font-medium text-ink transition-colors hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Save note
        </button>
      </form>
      {notes.length > 0 && (
        <div className="mt-3 space-y-2">
          {notes.map((n) => (
            <div key={n.id} className="flex items-start justify-between gap-3 rounded-lg border border-line bg-white/[0.015] px-3.5 py-2.5">
              <div>
                <p className="text-[12.5px] leading-relaxed text-ink-muted">{n.text}</p>
                <p className="mt-1 text-[10.5px] text-ink-faint">{new Date(n.at).toLocaleString("en-IN")}</p>
              </div>
              <button onClick={() => remove(n.id)} aria-label="Delete note" className="shrink-0 text-ink-faint hover:text-neg">✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
