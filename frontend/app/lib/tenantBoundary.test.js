import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import { query } from "./db.js";
import { createTestUser, deleteTestUser } from "./invest/testHelpers.js";

vi.mock("./auth.js", () => ({ auth: vi.fn() }));
const { auth } = await import("./auth.js");
const root = resolve("app/api/v1");
const routes = readdirSync(root, { recursive: true }).filter(file => file.endsWith("route.js"))
  .map(file => resolve(root, file)).filter(file => /import\s*\{[^}]*\brequireUser\b[^}]*\}\s*from/.test(readFileSync(file, "utf8")));
const uuid = "00000000-0000-4000-8000-000000000001";

describe("operator alert endpoint is secret-gated, not investor-session-gated", () => {
  it("fails closed with 503 when its operator capability is unconfigured", async () => {
    vi.stubEnv("ALERTS_INTERNAL_SECRET", "");
    try {
      const { POST } = await import("../api/v1/internal/alerts/run/route.js");
      expect((await POST(new Request("http://localhost/api/test", { method: "POST" }))).status).toBe(503);
    } finally { vi.unstubAllEnvs(); }
  });
  it("rejects an absent operator secret with 401 when configured", async () => {
    vi.stubEnv("ALERTS_INTERNAL_SECRET", "disposable-test-only-operator-secret");
    try {
      const { POST } = await import("../api/v1/internal/alerts/run/route.js");
      expect((await POST(new Request("http://localhost/api/test", { method: "POST" }))).status).toBe(401);
    } finally { vi.unstubAllEnvs(); }
  });
});

describe("every directly authenticated v1 route rejects an absent session", () => {
  for (const file of routes) {
    it(relative(root, file), async () => {
      auth.mockResolvedValue(null);
      const route = await import(file);
      for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
        if (typeof route[method] !== "function") continue;
        const request = new Request("http://localhost/api/test", { method, ...(method === "GET" ? {} : { body: JSON.stringify({ userId: uuid, user_id: uuid, text: "spoof" }), headers: { "content-type": "application/json" } }) });
        const response = await route[method](request, { params: Promise.resolve({ id: uuid, orderId: uuid, schemeCode: "100033", itemKey: "profile" }) });
        expect(response.status, `${relative(root, file)} ${method}`).toBe(401);
      }
    });
  }
});

describe("real database: B cannot read, modify or delete A's research objects", () => {
  let a, b, noteId, collectionId;
  beforeAll(async () => {
    a = await createTestUser("remediation-owner-a");
    b = await createTestUser("remediation-owner-b");
    noteId = (await query("insert into user_research_notes(user_id,scheme_code,text) values($1,'100033','owner-a-only') returning id", [a])).rows[0].id;
    collectionId = (await query("insert into user_collections(user_id,name) values($1,'owner-a-only') returning id", [a])).rows[0].id;
    await query("insert into portfolio_holdings(user_id,scheme_code,units,avg_cost,source,folio_number) values($1,'100033',100,10,'manual','isolation-a')", [a]);
  });
  afterAll(async () => { if (a) await deleteTestUser(a); if (b) await deleteTestUser(b); });
  it("uses authenticated B instead of spoofed A in portfolio and notes reads", async () => {
    auth.mockResolvedValue({ user: { id: b } });
    for (const file of ["portfolio/holdings/route.js", "sync/notes/route.js", "sync/collections/route.js"]) {
      const route = await import(resolve(root, file));
      const response = await route.GET(new Request(`http://localhost/api/test?user_id=${a}`));
      expect(response.status).toBe(200);
      const body = await response.text();
      expect(body).not.toContain("owner-a-only");
      expect(body).not.toContain("isolation-a");
    }
  });
  it("rejects direct-object modification and leaves A's rows intact after B deletes", async () => {
    auth.mockResolvedValue({ user: { id: b } });
    const notes = await import("../api/v1/sync/notes/[id]/route.js");
    const context = { params: Promise.resolve({ id: noteId }) };
    const update = await notes.PUT(new Request("http://localhost", { method: "PUT", body: JSON.stringify({ text: "spoof", user_id: a }) }), context);
    expect(update.status).toBe(404);
    await notes.DELETE(new Request("http://localhost", { method: "DELETE" }), context);
    const collections = await import("../api/v1/sync/collections/[id]/route.js");
    await collections.DELETE(new Request("http://localhost", { method: "DELETE" }), { params: Promise.resolve({ id: collectionId }) });
    expect((await query("select text from user_research_notes where id=$1 and user_id=$2", [noteId, a])).rows[0].text).toBe("owner-a-only");
    expect((await query("select name from user_collections where id=$1 and user_id=$2", [collectionId, a])).rows[0].name).toBe("owner-a-only");
  });
});
