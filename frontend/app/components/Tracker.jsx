"use client";
import { useEffect } from "react";
import { track } from "../lib/track";
import { saveHistory } from "../lib/cloudSync";

// Drop-in client component that logs one event when a (server) page mounts, and optionally
// records this page into session/history memory (Phase 4 personalization; cloud-synced when
// signed in) — pass `view` as { type: 'fund'|'amc'|'category', id, name, amc?, category? } for
// pages worth remembering.
export default function Tracker({ event, payload, view }) {
  useEffect(() => {
    track(event, payload || {});
    if (view) saveHistory({ type: view.type, ...view });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, JSON.stringify(payload), JSON.stringify(view)]);
  return null;
}
