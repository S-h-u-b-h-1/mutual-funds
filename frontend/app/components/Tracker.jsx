"use client";
import { useEffect } from "react";
import { track } from "../lib/track";

// Drop-in client component that logs one event when a (server) page mounts.
export default function Tracker({ event, payload }) {
  useEffect(() => {
    track(event, payload || {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, JSON.stringify(payload)]);
  return null;
}
