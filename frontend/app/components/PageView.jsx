"use client";
import { useEffect } from "react";
import { track } from "../lib/track";

const SCROLL_MILESTONES = [25, 50, 75, 100];

// Fires one page_view per mount (Phase 4 collection), then instruments the two engagement
// signals that need a page-lifetime listener rather than a one-off click: scroll depth
// (fires once per milestone per page) and session duration (fires once, on the way out).
export default function PageView() {
  useEffect(() => {
    track("page_view", {});

    const start = Date.now();
    const seen = new Set();
    function onScroll() {
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - window.innerHeight;
      const pct = scrollable > 0 ? Math.min(100, Math.round(((window.scrollY || doc.scrollTop) / scrollable) * 100)) : 100;
      for (const m of SCROLL_MILESTONES) {
        if (pct >= m && !seen.has(m)) {
          seen.add(m);
          track("scroll_depth", { depth: m, path: window.location.pathname });
        }
      }
    }
    window.addEventListener("scroll", onScroll, { passive: true });

    // pagehide (not visibilitychange) is the single reliable "leaving this page" signal — it
    // fires exactly once per navigation/close, so session_duration can't double-report from a
    // user simply switching tabs and coming back.
    let reported = false;
    function onLeave() {
      if (reported) return;
      reported = true;
      const seconds = Math.round((Date.now() - start) / 1000);
      if (seconds < 1) return; // filter accidental instant navigations, not a real session
      track("session_duration", { seconds, path: window.location.pathname, max_scroll_depth: seen.size ? Math.max(...seen) : 0 });
    }
    window.addEventListener("pagehide", onLeave);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", onLeave);
    };
  }, []);
  return null;
}
