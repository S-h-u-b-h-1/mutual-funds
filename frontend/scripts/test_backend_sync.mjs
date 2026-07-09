#!/usr/bin/env node
// Integration test suite for the auth/cloud-sync/alerts backend (Personal Investment Operating
// System sprint). Plain Node + fetch, no test framework dependency — run against a live dev
// server (or any deployed environment) with real DATABASE_URL/AUTH_SECRET configured.
//
// Usage: node scripts/test_backend_sync.mjs [--base-url http://localhost:3000]
// Creates its own throwaway users (randomUUID-suffixed emails) and deletes them via
// DELETE /api/v1/account when done, so it's safe to run repeatedly against a real database —
// it does not touch any pre-existing user's data. Exits 1 on any failure (CI-friendly).
import { randomUUID } from "node:crypto";

const BASE_URL = process.argv.includes("--base-url")
  ? process.argv[process.argv.indexOf("--base-url") + 1]
  : process.env.BASE_URL || "http://localhost:3000";

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, label) {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(label);
    console.error(`  FAIL: ${label}`);
  }
}

// Auth.js's own routes are cookie-based (csrf-token, callback-url, and eventually the session
// token — set across several different responses, not all at once). res.headers.get("set-cookie")
// silently comma-folds multiple Set-Cookie headers into one unusable string in Node's fetch;
// getSetCookie() returns them as a proper array. This jar accumulates by cookie name across
// requests rather than overwriting, since a later response (e.g. the credentials callback) does
// not necessarily re-send every cookie an earlier response (e.g. /api/auth/csrf) already set —
// dropping any of them causes Auth.js to reject the CSRF check and silently redirect instead of
// completing sign-in.
function makeSession() {
  const jar = new Map();
  const req = async (path, options = {}) => {
    const cookieHeader = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}), ...(cookieHeader ? { Cookie: cookieHeader } : {}) },
    });
    for (const raw of res.headers.getSetCookie()) {
      const [pair] = raw.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
    }
    let body = null;
    try {
      body = await res.json();
    } catch {
      /* fine */
    }
    return { status: res.status, body };
  };

  return {
    async register(email, password, name = "Test User") {
      return req("/api/auth/register", { method: "POST", body: JSON.stringify({ name, email, password }) });
    },
    async login(email, password) {
      const csrf = await req("/api/auth/csrf");
      // X-Auth-Return-Redirect: 1 is what next-auth/react's own signIn() sends to get a direct
      // JSON {url} response with the session cookie on THIS response, instead of a 3xx redirect
      // a plain script can't follow-and-still-see-the-Set-Cookie-header on (a browser's network
      // stack captures cookies across every hop of an auto-followed redirect invisibly to JS;
      // Node's fetch only exposes the final response's headers, so a followed redirect here
      // would silently render the login PAGE and drop the session cookie).
      return req("/api/auth/callback/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1" },
        body: new URLSearchParams({ email, password, csrfToken: csrf.body.csrfToken, callbackUrl: BASE_URL }).toString(),
      });
    },
    async session() {
      return req("/api/auth/session");
    },
    get: (path) => req(path),
    post: (path, body) => req(path, { method: "POST", body: JSON.stringify(body) }),
    put: (path, body) => req(path, { method: "PUT", body: JSON.stringify(body) }),
    del: (path, body) => req(path, { method: "DELETE", ...(body ? { body: JSON.stringify(body) } : {}) }),
  };
}

async function main() {
  console.log(`Testing backend at ${BASE_URL}\n`);

  const userAEmail = `test-a-${randomUUID()}@example.com`;
  const userBEmail = `test-b-${randomUUID()}@example.com`;
  const password = "integration-test-pw-1";
  const a = makeSession();
  const b = makeSession();

  console.log("Auth: register + duplicate + weak password + login");
  const reg1 = await a.register(userAEmail, password, "User A");
  assert(reg1.status === 201, "register: new user returns 201");
  const regDup = await a.register(userAEmail, password, "User A");
  assert(regDup.status === 409, "register: duplicate email returns 409");
  const regWeak = await a.register(`weak-${randomUUID()}@example.com`, "short");
  assert(regWeak.status === 400, "register: weak password rejected");

  const login1 = await a.login(userAEmail, password);
  assert(login1.status === 200, "login: correct credentials returns 200");
  const sess1 = await a.session();
  assert(sess1.body?.user?.email === userAEmail, "session: reflects logged-in user");
  const loginWrong = await makeSession().login(userAEmail, "totally-wrong-password");
  assert(loginWrong.body?.url?.includes("error="), "login: wrong password redirects to an error, not a session");

  await b.register(userBEmail, password, "User B");
  await b.login(userBEmail, password);

  console.log("Sync: watchlist");
  const wAdd = await a.post("/api/v1/sync/watchlist", { schemeCode: "100033", fundName: "Test Fund", amc: "Test AMC" });
  assert(wAdd.status === 201, "watchlist add: 201");
  const wAddAgain = await a.post("/api/v1/sync/watchlist", { schemeCode: "100033", fundName: "Test Fund", amc: "Test AMC" });
  assert(wAddAgain.status === 200, "watchlist add: idempotent re-add returns 200");
  const wList = await a.get("/api/v1/sync/watchlist");
  assert(wList.body?.items?.length === 1, "watchlist list: exactly 1 item");

  console.log("Sync: notes");
  const nCreate = await a.post("/api/v1/sync/notes", { schemeCode: "100033", text: "note one" });
  assert(nCreate.status === 201 && nCreate.body?.id, "notes create: 201 with id");
  const nUpdate = await a.put(`/api/v1/sync/notes/${nCreate.body.id}`, { text: "note one edited" });
  assert(nUpdate.body?.text === "note one edited", "notes update: text changed");

  console.log("Sync: history");
  const hView = await a.post("/api/v1/sync/history", { entityType: "fund", entityId: "100033", entityName: "Test Fund" });
  assert(hView.status === 201, "history record: 201");
  const hList = await a.get("/api/v1/sync/history");
  assert(hList.body?.items?.some((i) => i.entity_id === "100033"), "history list: contains recorded view");

  console.log("Sync: comparisons (replace-by-name)");
  const c1 = await a.post("/api/v1/sync/comparisons", { name: "Shortlist", amcs: ["HDFC"] });
  const c2 = await a.post("/api/v1/sync/comparisons", { name: "Shortlist", amcs: ["HDFC", "SBI"] });
  assert(c1.status === 201, "comparisons: first save is 201");
  assert(c2.status === 200, "comparisons: re-save under same name is 200 (update, not create)");
  const cList = await a.get("/api/v1/sync/comparisons");
  assert(cList.body?.items?.length === 1 && cList.body.items[0].amcs.length === 2, "comparisons: replaced, not duplicated");

  console.log("Sync: collections + items");
  const colCreate = await a.post("/api/v1/sync/collections", { name: "Retirement" });
  assert(colCreate.status === 201, "collections create: 201");
  const itemAdd = await a.post(`/api/v1/sync/collections/${colCreate.body.id}/items`, { schemeCode: "100033" });
  assert(itemAdd.status === 201, "collection item add: 201");
  const colList = await a.get("/api/v1/sync/collections");
  assert(colList.body?.items?.[0]?.items?.length === 1, "collections list: nested item present");

  console.log("Sync: preferences");
  const pSet = await a.put("/api/v1/sync/preferences", { theme: "dark" });
  assert(pSet.body?.theme === "dark", "preferences: set + echoed back");

  console.log("Sync: migration — full payload, then idempotency");
  const migratePayload = {
    watchlist: [{ code: "100037", name: "Migrated Fund", amc: "Migrated AMC" }],
    notes: { "100037": [{ text: "migrated note", fundName: "Migrated Fund", at: new Date().toISOString() }] },
    recentViews: [{ type: "fund", id: "100037", name: "Migrated Fund", at: new Date().toISOString() }],
    recentSearches: ["migrated search"],
    recentComparisons: [{ name: "Migrated Comparison", amcs: ["HDFC"], at: new Date().toISOString() }],
  };
  const migrate1 = await a.post("/api/v1/sync/migrate", migratePayload);
  assert(migrate1.body?.migrated === true, "migrate: first call reports migrated:true");
  assert(
    migrate1.body?.counts?.watchlist === 1 && migrate1.body?.counts?.notes === 1 && migrate1.body?.counts?.history === 2 && migrate1.body?.counts?.comparisons === 1,
    "migrate: per-category counts match the payload (watchlist 1, notes 1, history 2 [view+search], comparisons 1)"
  );
  const migrate2 = await a.post("/api/v1/sync/migrate", migratePayload);
  assert(migrate2.body?.migrated === false && migrate2.body?.reason === "already_migrated", "migrate: second call is a clean no-op, not a re-import");
  const postMigrateWatchlist = await a.get("/api/v1/sync/watchlist");
  assert(postMigrateWatchlist.body?.items?.some((i) => i.scheme_code === "100037"), "migrate: migrated watchlist item is actually queryable, not just counted");
  const postMigrateComparisons = await a.get("/api/v1/sync/comparisons");
  assert(postMigrateComparisons.body?.items?.some((c) => c.name === "Migrated Comparison"), "migrate: migrated comparison is actually queryable, not just counted");

  console.log("Alerts: rule CRUD");
  const alertCreate = await a.post("/api/v1/sync/alerts", {
    alertType: "health_score", targetType: "fund", targetId: "100033", condition: { op: "below", value: 100 },
  });
  assert(alertCreate.status === 201, "alerts create: 201");
  const alertList = await a.get("/api/v1/sync/alerts");
  assert(alertList.body?.items?.length === 1, "alerts list: exactly 1 rule");

  console.log("Cross-user authorization boundary (the load-bearing test — no RLS, app code is the only gate)");
  const bWatchlist = await b.get("/api/v1/sync/watchlist");
  assert(bWatchlist.body?.items?.length === 0, "isolation: user B sees zero of user A's watchlist items");
  const bNotes = await b.get("/api/v1/sync/notes");
  assert(bNotes.body?.items?.length === 0, "isolation: user B sees zero of user A's notes");
  const bNoteEdit = await b.put(`/api/v1/sync/notes/${nCreate.body.id}`, { text: "hijacked" });
  assert(bNoteEdit.status === 404, "isolation: user B cannot edit user A's note (404)");
  const bItemAdd = await b.post(`/api/v1/sync/collections/${colCreate.body.id}/items`, { schemeCode: "999999" });
  assert(bItemAdd.status === 404, "isolation: user B cannot add items to user A's collection (404)");
  const bAlertDisable = await b.put(`/api/v1/sync/alerts/${alertCreate.body.id}`, { enabled: false });
  assert(bAlertDisable.status === 404, "isolation: user B cannot modify user A's alert rule (404)");
  const bDelete = await b.del(`/api/v1/sync/collections/${colCreate.body.id}`);
  assert(bDelete.status === 204, "isolation: user B's delete of user A's collection safely no-ops (204, not an error)");
  const aCollectionsAfter = await a.get("/api/v1/sync/collections");
  assert(aCollectionsAfter.body?.items?.length === 1, "isolation: user A's collection survived user B's no-op delete attempt");
  const bComparisons = await b.get("/api/v1/sync/comparisons");
  assert(bComparisons.body?.items?.length === 0, "isolation: user B sees zero of user A's comparisons");
  const bComparisonDelete = await b.del(`/api/v1/sync/comparisons/${c1.body.id}`);
  assert(bComparisonDelete.status === 204, "isolation: user B's delete of user A's comparison safely no-ops");
  const aComparisonsAfter = await a.get("/api/v1/sync/comparisons");
  assert(
    aComparisonsAfter.body?.items?.some((c) => c.id === c1.body.id && c.name === "Shortlist"),
    "isolation: user A's comparison survived user B's no-op delete attempt"
  );
  await b.put("/api/v1/sync/preferences", { theme: "light" });
  const aPrefsAfterBWrite = await a.get("/api/v1/sync/preferences");
  assert(aPrefsAfterBWrite.body?.theme === "dark", "isolation: user B's preference write never touched user A's preferences");

  console.log("Cross-device: same account, two independent sessions (device A writes, device B sees it)");
  const emailC = `test-c-${randomUUID()}@example.com`;
  const deviceA = makeSession();
  const deviceB = makeSession();
  await deviceA.register(emailC, password, "Cross Device User");
  await deviceA.login(emailC, password);
  await deviceA.post("/api/v1/sync/watchlist", { schemeCode: "100033", fundName: "Cross Device Fund", amc: "Test AMC" });
  const deviceBLogin = await deviceB.login(emailC, password);
  assert(deviceBLogin.status === 200, "cross-device: device B logs into the same account");
  const deviceBWatchlist = await deviceB.get("/api/v1/sync/watchlist");
  assert(deviceBWatchlist.body?.items?.some((i) => i.scheme_code === "100033"), "cross-device: watchlist item added on device A is visible on device B");
  await deviceA.del("/api/v1/account", { confirmEmail: emailC });

  console.log("Alerts: per-user rule cap (feeds the shared, unpaginated /api/v1/internal/alerts/run batch job)");
  for (let i = 0; i < 49; i++) {
    await a.post("/api/v1/sync/alerts", { alertType: "health_score", targetType: "fund", targetId: `cap-${i}`, condition: { op: "below", value: 100 } });
  }
  const capHit = await a.post("/api/v1/sync/alerts", { alertType: "health_score", targetType: "fund", targetId: "one-too-many", condition: { op: "below", value: 100 } });
  assert(capHit.status === 429, "alert rule cap: the 51st rule (1 from earlier + 49 here + 1) is rejected with 429");

  console.log("Auth: forgot/reset password (generic response, no enumeration)");
  const forgotKnown = await a.post("/api/auth/forgot-password", { email: userAEmail });
  const forgotUnknown = await a.post("/api/auth/forgot-password", { email: `nobody-${randomUUID()}@example.com` });
  assert(forgotKnown.status === 200 && forgotUnknown.status === 200, "forgot-password: same 200 status regardless of account existence");
  assert(JSON.stringify(forgotKnown.body) === JSON.stringify(forgotUnknown.body), "forgot-password: identical response body regardless of account existence");

  console.log("Account: deletion (wrong confirmation, then real cleanup)");
  const delWrong = await a.del("/api/v1/account", { confirmEmail: "not-my-email@example.com" });
  assert(delWrong.status === 400, "account delete: wrong confirmEmail rejected");
  const delA = await a.del("/api/v1/account", { confirmEmail: userAEmail });
  assert(delA.status === 204, "account delete: correct confirmEmail succeeds");
  const delB = await b.del("/api/v1/account", { confirmEmail: userBEmail });
  assert(delB.status === 204, "account delete: user B cleanup succeeds");

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) {
    console.error("\nFailed checks:");
    failures.forEach((f) => console.error(`  - ${f}`));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test run crashed:", err);
  process.exit(1);
});
