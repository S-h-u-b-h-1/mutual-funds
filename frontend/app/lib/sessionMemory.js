"use client";
// Anonymous session intelligence (Phase 4) — no login, no server round-trip, no PII beyond
// what the browser already has. Purely local: recently viewed funds/AMCs/categories, recent
// searches, and inferred preferences (from view frequency, not asserted). Same mfp_* key +
// custom-event convention as WatchButton.jsx so components can react to same-tab changes.
const VIEWS_KEY = "mfp_recent_views";
const SEARCH_KEY = "mfp_recent_searches";
const MAX_VIEWS = 24;
const MAX_SEARCHES = 10;

function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; }
}
function write(key, value, evt) {
  try { localStorage.setItem(key, JSON.stringify(value)); window.dispatchEvent(new Event(evt)); } catch {}
}

// type: 'fund' | 'amc' | 'category'
export function recordView(type, entry) {
  if (!entry?.id) return;
  const views = read(VIEWS_KEY, []);
  const next = [{ type, ...entry, at: entry.at || null }, ...views.filter((v) => !(v.type === type && v.id === entry.id))].slice(0, MAX_VIEWS);
  write(VIEWS_KEY, next, "mfp-session");
}

export function recordSearch(q) {
  const query = String(q || "").trim();
  if (query.length < 2) return;
  const searches = read(SEARCH_KEY, []);
  const next = [query, ...searches.filter((s) => s.toLowerCase() !== query.toLowerCase())].slice(0, MAX_SEARCHES);
  write(SEARCH_KEY, next, "mfp-session");
}

export function getRecentViews(type, limit = 6) {
  const views = read(VIEWS_KEY, []);
  return (type ? views.filter((v) => v.type === type) : views).slice(0, limit);
}

export function getRecentSearches(limit = 8) {
  return read(SEARCH_KEY, []).slice(0, limit);
}

export function clearRecentSearches() {
  write(SEARCH_KEY, [], "mfp-session");
}

// Inferred, never asserted as fact — "you've looked at N Equity-category funds this session".
export function preferredCategories(limit = 3) {
  const counts = {};
  for (const v of read(VIEWS_KEY, [])) if (v.type === "fund" && v.category) counts[v.category] = (counts[v.category] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([category, count]) => ({ category, count }));
}

export function preferredAmcs(limit = 3) {
  const counts = {};
  for (const v of read(VIEWS_KEY, [])) if (v.amc) counts[v.amc] = (counts[v.amc] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([amc, count]) => ({ amc, count }));
}

// "Continue where you left off" — the single most recent view, if any.
export function lastVisited() {
  const views = read(VIEWS_KEY, []);
  return views.length ? views[0] : null;
}
