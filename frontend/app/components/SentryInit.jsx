"use client";
import { useEffect } from "react";

// Frontend error tracking — no-op unless NEXT_PUBLIC_SENTRY_DSN is set.
// Lazy-loaded so it adds nothing to the critical path.
export default function SentryInit() {
  useEffect(() => {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
    if (!dsn) return;
    import("@sentry/browser")
      .then((S) => S.init({ dsn, tracesSampleRate: 0.1 }))
      .catch(() => {});
  }, []);
  return null;
}
