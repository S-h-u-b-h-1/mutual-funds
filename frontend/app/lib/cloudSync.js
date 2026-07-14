"use client";
// Cloud sync adapter (frontend integration sprint) — the one place every component decides
// "cloud or local" instead of each one reimplementing that check. Behavior contract:
//   logged in    -> read/write the /api/v1/sync/* APIs, mirror writes into localStorage too
//                   (a durable fallback cache, not the source of truth once signed in)
//   logged out   -> pure localStorage, byte-for-byte the same keys/shapes this app already used
//                   before this adapter existed — anonymous behavior is unchanged
//   cloud fails  -> caught, falls back to whatever's in localStorage; never throws into a caller
// Local storage keys/shapes are unchanged from sessionMemory.js / WatchButton.jsx on purpose —
// this is a drop-in replacement for direct localStorage access, not a new local schema.
import { getSession } from "next-auth/react";

const WATCHLIST_KEY = "mfp_watchlist";
const NOTES_KEY = "mfp_research_notes";
const VIEWS_KEY = "mfp_recent_views";
const SEARCH_KEY = "mfp_recent_searches";
const COMPARE_KEY = "mfp_recent_compares";
const PREF_KEYS = { leftCollapsed: "mfp_left_collapsed", rightCollapsed: "mfp_right_collapsed", audioEnabled: "mfp_audio_enabled" };

function readLocal(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}
function writeLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full/disabled — the write just doesn't persist, nothing to throw */
  }
}
// Same same-tab-sync convention WatchButton.jsx/Watchlist.jsx already used ("mfp-watchlist") —
// broadened to one event name every synced surface can listen for, cloud or local.
function notify() {
  try {
    window.dispatchEvent(new Event("mfp-sync"));
  } catch {
    /* no window (SSR) */
  }
}

// getSession() is a plain async function (unlike the useSession() hook), safe to call from
// here. Cached briefly so a burst of adapter calls in one interaction (e.g. loading a fund page
// that both records a view and checks the watchlist) doesn't fire N redundant /api/auth/session
// requests.
let cached = null;
let cachedAt = 0;
async function currentUser() {
  if (cached !== null && Date.now() - cachedAt < 5000) return cached;
  const session = await getSession().catch(() => null);
  cached = session?.user ?? null;
  cachedAt = Date.now();
  return cached;
}

async function cloudFetch(path, options) {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...options });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.status === 204 ? null : res.json();
}

export async function getSyncStatus() {
  const user = await currentUser();
  return user ? { mode: "cloud", loggedIn: true, email: user.email, name: user.name } : { mode: "local", loggedIn: false };
}

// ---------------------------------------------------------------- Watchlist
export async function getWatchlist() {
  const user = await currentUser();
  if (!user) return readLocal(WATCHLIST_KEY, []);
  try {
    const { items } = await cloudFetch("/api/v1/sync/watchlist");
    return items.map((i) => ({ code: i.scheme_code, name: i.fund_name, amc: i.amc }));
  } catch {
    return readLocal(WATCHLIST_KEY, []);
  }
}

export async function saveWatchlist({ code, name, amc }) {
  if (!code) return;
  const local = readLocal(WATCHLIST_KEY, []);
  if (!local.some((x) => x.code === code)) writeLocal(WATCHLIST_KEY, [...local, { code, name, amc }]);
  const user = await currentUser();
  if (user) {
    try {
      await cloudFetch("/api/v1/sync/watchlist", { method: "POST", body: JSON.stringify({ schemeCode: code, fundName: name, amc }) });
    } catch {
      /* local mirror above already covers this */
    }
  }
  notify();
}

export async function removeFromWatchlist(code) {
  const local = readLocal(WATCHLIST_KEY, []);
  writeLocal(WATCHLIST_KEY, local.filter((x) => x.code !== code));
  const user = await currentUser();
  if (user) {
    try {
      await cloudFetch(`/api/v1/sync/watchlist/${encodeURIComponent(code)}`, { method: "DELETE" });
    } catch {
      /* local mirror above already covers this */
    }
  }
  notify();
}

// ---------------------------------------------------------------- Notes
export async function getNotes(code) {
  const user = await currentUser();
  if (!user) return readLocal(NOTES_KEY, {})[code] || [];
  try {
    const { items } = await cloudFetch(`/api/v1/sync/notes?schemeCode=${encodeURIComponent(code)}`);
    return items.map((n) => ({ id: n.id, text: n.text, fundName: n.fund_name, at: n.created_at }));
  } catch {
    return readLocal(NOTES_KEY, {})[code] || [];
  }
}

export async function getAllNotes(limit = 50) {
  const user = await currentUser();
  const fromLocal = () => {
    const all = readLocal(NOTES_KEY, {});
    return Object.entries(all)
      .flatMap(([code, notes]) => notes.map((n) => ({ ...n, code })))
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .slice(0, limit);
  };
  if (!user) return fromLocal();
  try {
    const { items } = await cloudFetch("/api/v1/sync/notes");
    return items.slice(0, limit).map((n) => ({ id: n.id, code: n.scheme_code, text: n.text, fundName: n.fund_name, at: n.created_at }));
  } catch {
    return fromLocal();
  }
}

export async function saveNote(code, text, fundName) {
  const trimmed = String(text || "").trim();
  if (!code || !trimmed) return null;

  const localEntry = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, text: trimmed, fundName: fundName || null, at: new Date().toISOString() };
  const all = readLocal(NOTES_KEY, {});
  all[code] = [localEntry, ...(all[code] || [])].slice(0, 20);
  writeLocal(NOTES_KEY, all);

  const user = await currentUser();
  if (user) {
    try {
      const created = await cloudFetch("/api/v1/sync/notes", { method: "POST", body: JSON.stringify({ schemeCode: code, fundName, text: trimmed }) });
      notify();
      return { id: created.id, text: created.text, fundName: created.fund_name, at: created.created_at };
    } catch {
      /* fall through to the local entry already written above */
    }
  }
  notify();
  return localEntry;
}

export async function deleteNote(code, id) {
  const all = readLocal(NOTES_KEY, {});
  if (all[code]) {
    all[code] = all[code].filter((n) => n.id !== id);
    writeLocal(NOTES_KEY, all);
  }
  const user = await currentUser();
  if (user) {
    try {
      await cloudFetch(`/api/v1/sync/notes/${id}`, { method: "DELETE" });
    } catch {
      /* local mirror above already covers this */
    }
  }
  notify();
}

// ---------------------------------------------------------------- History (views + searches)
export async function getHistory({ type, limit = 24 } = {}) {
  const user = await currentUser();
  const fromLocal = () => {
    const all = readLocal(VIEWS_KEY, []);
    return (type ? all.filter((v) => v.type === type) : all).slice(0, limit);
  };
  if (!user) return fromLocal();
  try {
    const qs = new URLSearchParams({ limit: String(limit), ...(type ? { type } : {}) });
    const { items } = await cloudFetch(`/api/v1/sync/history?${qs}`);
    return items.map((i) => ({ type: i.entity_type, id: i.entity_id, name: i.entity_name, at: i.viewed_at, ...(i.meta || {}) }));
  } catch {
    return fromLocal();
  }
}

// entry: { type: 'fund'|'amc'|'category'|'manager'|'benchmark', id, name, amc?, category?, at? }
// — same shape sessionMemory.recordView() already used.
export async function saveHistory(entry) {
  if (!entry?.id) return;
  const withTime = { ...entry, at: entry.at || new Date().toISOString() };
  const local = readLocal(VIEWS_KEY, []);
  const next = [withTime, ...local.filter((v) => !(v.type === entry.type && v.id === entry.id))].slice(0, 24);
  writeLocal(VIEWS_KEY, next);

  const user = await currentUser();
  if (user) {
    const { type, id, name, at, ...meta } = entry;
    try {
      await cloudFetch("/api/v1/sync/history", {
        method: "POST",
        body: JSON.stringify({ entityType: type, entityId: id, entityName: name, meta: Object.keys(meta).length ? meta : undefined }),
      });
    } catch {
      /* local mirror above already covers this */
    }
  }
  notify();
}

// Derived views over getHistory(), same computations sessionMemory.js's lastVisited()/
// preferredCategories()/preferredAmcs() already did over the raw local array — just sourced
// from whichever backend getHistory() itself resolved to.
export async function lastVisited() {
  const views = await getHistory({ limit: 1 });
  return views[0] || null;
}

export async function preferredCategories(limit = 3) {
  const views = await getHistory({ limit: 100 });
  const counts = {};
  for (const v of views) if (v.type === "fund" && v.category) counts[v.category] = (counts[v.category] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([category, count]) => ({ category, count }));
}

export async function preferredAmcs(limit = 3) {
  const views = await getHistory({ limit: 100 });
  const counts = {};
  for (const v of views) if (v.amc) counts[v.amc] = (counts[v.amc] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([amc, count]) => ({ amc, count }));
}

export async function getSearchHistory(limit = 8) {
  const user = await currentUser();
  if (!user) return readLocal(SEARCH_KEY, []).slice(0, limit);
  try {
    const { items } = await cloudFetch(`/api/v1/sync/history?type=search&limit=${limit}`);
    return items.map((i) => i.entity_id);
  } catch {
    return readLocal(SEARCH_KEY, []).slice(0, limit);
  }
}

export async function saveSearch(query) {
  const q = String(query || "").trim();
  if (q.length < 2) return;
  const local = readLocal(SEARCH_KEY, []);
  writeLocal(SEARCH_KEY, [q, ...local.filter((s) => s.toLowerCase() !== q.toLowerCase())].slice(0, 10));

  const user = await currentUser();
  if (user) {
    try {
      await cloudFetch("/api/v1/sync/history", { method: "POST", body: JSON.stringify({ entityType: "search", entityId: q, entityName: q }) });
    } catch {
      /* local mirror above already covers this */
    }
  }
  notify();
}

export async function clearSearchHistory() {
  writeLocal(SEARCH_KEY, []);
  notify();
  // No cloud DELETE-all for search history exists (or is needed) yet — searches are individual
  // rows in user_research_history, not a single deletable resource. Clearing is local-only.
}

// ---------------------------------------------------------------- Comparisons
export async function getComparisons() {
  const user = await currentUser();
  if (!user) return readLocal(COMPARE_KEY, []);
  try {
    const { items } = await cloudFetch("/api/v1/sync/comparisons");
    return items.map((c) => ({ id: c.id, name: c.name, amcs: c.amcs, at: c.created_at }));
  } catch {
    return readLocal(COMPARE_KEY, []);
  }
}

export async function saveComparison(name, amcs) {
  if (!amcs?.length) return null;
  const local = readLocal(COMPARE_KEY, []);
  const localNext = [{ name, amcs, at: new Date().toISOString() }, ...local.filter((c) => c.name !== name)].slice(0, 10);
  writeLocal(COMPARE_KEY, localNext);

  const user = await currentUser();
  if (user) {
    try {
      const saved = await cloudFetch("/api/v1/sync/comparisons", { method: "POST", body: JSON.stringify({ name, amcs }) });
      notify();
      return { id: saved.id, name: saved.name, amcs: saved.amcs, at: saved.created_at };
    } catch {
      /* fall through to the local entry already written above */
    }
  }
  notify();
  return localNext[0];
}

// Comparisons are id-keyed server-side but name-keyed locally (mfp_recent_compares entries have
// no id) — pass whichever the caller has; at least one of the two actually deletes something.
export async function deleteComparison(id, name) {
  if (name) {
    const local = readLocal(COMPARE_KEY, []);
    writeLocal(COMPARE_KEY, local.filter((c) => c.name !== name));
  }
  const user = await currentUser();
  if (user && id) {
    try {
      await cloudFetch(`/api/v1/sync/comparisons/${id}`, { method: "DELETE" });
    } catch {
      /* local removal above (if a name was given) already covers this */
    }
  }
  notify();
}

// ---------------------------------------------------------------- Collections
// No local-only concept exists for these (see the frontend audit — zero current components read
// or write anything "collection"-shaped) and none is invented here; collections require an
// account, matching the mission's "cloud sync only for authenticated features" behavior.
export async function getCollections() {
  const user = await currentUser();
  if (!user) return [];
  try {
    const { items } = await cloudFetch("/api/v1/sync/collections");
    return items;
  } catch {
    return [];
  }
}

export async function saveCollection(name) {
  const user = await currentUser();
  if (!user) return null;
  try {
    const saved = await cloudFetch("/api/v1/sync/collections", { method: "POST", body: JSON.stringify({ name }) });
    notify();
    return saved;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- Preferences
// Maps the existing HomepageClient.jsx panel-state keys into the backend's generic
// dashboard_layout jsonb column — same local keys/behavior, just also mirrored to the cloud.
export async function getPreferences() {
  const local = {
    leftCollapsed: readLocal(PREF_KEYS.leftCollapsed, false),
    rightCollapsed: readLocal(PREF_KEYS.rightCollapsed, false),
    audioEnabled: readLocal(PREF_KEYS.audioEnabled, false),
  };
  const user = await currentUser();
  if (!user) return local;
  try {
    const cloud = await cloudFetch("/api/v1/sync/preferences");
    return cloud?.dashboard_layout ? { ...local, ...cloud.dashboard_layout } : local;
  } catch {
    return local;
  }
}

export async function savePreferences(partial) {
  for (const [k, v] of Object.entries(partial || {})) {
    if (PREF_KEYS[k] && v !== undefined) writeLocal(PREF_KEYS[k], v);
  }
  const user = await currentUser();
  if (user) {
    try {
      const merged = { ...(await getPreferences()), ...partial };
      const { leftCollapsed, rightCollapsed, audioEnabled } = merged;
      await cloudFetch("/api/v1/sync/preferences", { method: "PUT", body: JSON.stringify({ dashboardLayout: { leftCollapsed, rightCollapsed, audioEnabled } }) });
    } catch {
      /* local writes above already cover this */
    }
  }
}

// ---------------------------------------------------------------- Research profile
// Delegates local read/write to userProfile.js (it already owns the per-user storage-key
// logic); this just adds the cloud leg on top. Unlike every other resource in this file,
// saveResearchProfile() does NOT silently swallow a cloud failure into the same return shape
// as success — a trust-first platform can't say "synced" when the server 500'd. It returns
// { profile, syncState } where syncState is exactly one of 'synced' | 'local-only' | 'failed',
// so the caller can render a state that matches what actually happened, never a guess.
export async function getResearchProfile() {
  const user = await currentUser();
  if (!user) return null;
  try {
    return await cloudFetch("/api/v1/sync/research-profile");
  } catch {
    const { getStoredProfile } = await import("./userProfile");
    return getStoredProfile(user);
  }
}

export async function saveResearchProfile(sessionUser, profile) {
  const { saveStoredProfile } = await import("./userProfile");

  let saved = null;
  try {
    saved = saveStoredProfile(sessionUser, profile);
  } catch {
    /* localStorage write itself failed (full/disabled) — saved stays null */
  }

  const user = await currentUser();
  if (!user) {
    // Logged out: pure-local is the actual, honest contract here (unchanged from every other
    // resource in this file) — there is no cloud leg to have failed.
    return { profile: saved, syncState: saved ? "local-only" : "failed" };
  }

  try {
    const cloudProfile = await cloudFetch("/api/v1/sync/research-profile", { method: "PUT", body: JSON.stringify(profile) });
    return { profile: cloudProfile ?? saved, syncState: "synced" };
  } catch {
    return { profile: saved, syncState: saved ? "local-only" : "failed" };
  }
}

// ---------------------------------------------------------------- Migration
export { migrateLocalDataToCloud as migrateLocalToCloud } from "./migrateLocalData";
