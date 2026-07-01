"use client";
import { useEffect } from "react";
import { track } from "../lib/track";
import { recordView } from "../lib/sessionMemory";

// Drop-in client component that logs one event when a (server) page mounts, and optionally
// records this page into anonymous session memory (Phase 4 personalization) — pass `view` as
// { type: 'fund'|'amc'|'category', id, name, amc?, category? } for pages worth remembering.
export default function Tracker({ event, payload, view }) {
  useEffect(() => {
    track(event, payload || {});
    if (view) recordView(view.type, view);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, JSON.stringify(payload), JSON.stringify(view)]);
  return null;
}
