// Backward-compatibility test for notifyUser() (Phase 5 M5) — proves its exact pre-M5 call
// signature and resulting row shape are unchanged now that it's a thin wrapper around
// sendNotification(), so its 6 existing call sites (identityService, documentService,
// orderService, portfolioService, complianceService, and callers of this file itself) needed
// zero changes. Every one of THOSE files' own test suites already exercises notifyUser()
// transitively and continues to pass unmodified — this file adds the one thing they don't: a
// direct, explicit assertion on notifyUser()'s own contract.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import { query } from "../db.js";
import { notifyUser } from "./notifications.js";
import { createTestUser, deleteTestUser } from "./testHelpers.js";

const RUN = crypto.randomBytes(3).toString("hex");
let userId;

beforeAll(async () => {
  userId = await createTestUser(`notify-user-compat-${RUN}`);
});

afterAll(async () => {
  await deleteTestUser(userId);
});

describe("notifyUser (backward-compatible wrapper around sendNotification)", () => {
  it("accepts the exact pre-M5 call shape and produces a row with the exact legacy fields", async () => {
    await notifyUser(userId, "order_completed", {
      title: "Order completed",
      body: "Your purchase has settled.",
      relatedEntityType: "order",
      relatedEntityId: "11111111-1111-1111-1111-111111111111",
    });

    const r = await query(
      `select * from notifications where user_id = $1 and type = 'order_completed' order by created_at desc limit 1`,
      [userId]
    );
    expect(r.rows[0]).toMatchObject({
      title: "Order completed",
      body: "Your purchase has settled.",
      related_entity_type: "order",
      related_entity_id: "11111111-1111-1111-1111-111111111111",
      channel: "in_app",
      status: "delivered",
      category: "order",
    });
    expect(r.rows[0].read_at).toBeNull();
  });

  it("still emits NotificationSent on the real event bus", async () => {
    const before = await query(`select count(*)::int as c from domain_events where event_type = 'NotificationSent' and correlation_id = $1`, [userId]);
    await notifyUser(userId, "compat_check", { title: "Compat check" });
    const after = await query(`select count(*)::int as c from domain_events where event_type = 'NotificationSent' and correlation_id = $1`, [userId]);
    expect(after.rows[0].c).toBe(before.rows[0].c + 1);
  });

  it("works with only a title (body/relatedEntityType/relatedEntityId all optional, matching the original signature)", async () => {
    await expect(notifyUser(userId, "minimal", { title: "Just a title" })).resolves.toBeUndefined();
  });
});
