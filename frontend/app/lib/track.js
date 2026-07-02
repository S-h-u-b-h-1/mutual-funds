"use client";
// Behavioural event tracking -> Supabase user_events (public-insert RLS).
// Zero-loss: enriched context (page, referrer, device, entity) is written INSIDE payload so
// it is captured regardless of whether the structured columns (sql/006) are applied yet.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function sessionId() {
  try {
    let id = localStorage.getItem("mfp_sid");
    if (!id) {
      id = (crypto.randomUUID && crypto.randomUUID()) || String(Math.random()).slice(2);
      localStorage.setItem("mfp_sid", id);
    }
    return id;
  } catch {
    return "anon";
  }
}

function deviceType() {
  try {
    const w = window.innerWidth;
    return w < 640 ? "mobile" : w < 1024 ? "tablet" : "desktop";
  } catch {
    return "unknown";
  }
}

// in-memory dedup / rate-limit: drop identical event+entity fired within 2s (double-fire guard)
const recent = new Map();
function isDuplicate(key) {
  const now = Date.now();
  const last = recent.get(key);
  recent.set(key, now);
  if (recent.size > 200) recent.delete(recent.keys().next().value);
  return last != null && now - last < 2000;
}

function entityOf(p) {
  if (p.code) return ["fund", String(p.code)];
  if (p.amc) return ["amc", String(p.amc)];
  if (p.category) return ["category", String(p.category)];
  if (p.q != null) return ["search", String(p.q).slice(0, 60)];
  // depth/option distinguish otherwise-identical event types (e.g. scroll_depth fired at 25%
  // then 50% within the 2s dedup window) — without this the second milestone is silently dropped.
  if (p.depth != null) return ["scroll", String(p.depth)];
  if (p.option) return ["option", String(p.option)];
  if (p.label) return ["cta", String(p.label)];
  if (p.column) return ["column", String(p.column)];
  if (p.article) return ["article", String(p.article)];
  if (p.filter) return ["filter", String(p.filter)];
  return [null, null];
}

export function track(eventType, payload = {}) {
  try {
    if (!eventType) return;
    const [entity_type, entity_id] = entityOf(payload);
    if (isDuplicate(`${eventType}:${entity_id || ""}`)) return; // dedup
    const enriched = {
      ...payload,
      entity_type,
      entity_id,
      page_path: typeof location !== "undefined" ? location.pathname : null,
      referrer: typeof document !== "undefined" ? document.referrer || null : null,
      device_type: deviceType(),
    };
    fetch(`${URL}/rest/v1/user_events`, {
      method: "POST",
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ session_id: sessionId(), event_type: eventType, payload: enriched }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* never let tracking break the page */
  }
}
