// Notification Platform core tests (Phase 5 M5, sub-step 1) — real Neon, no mocks of the engine
// itself. This file calls runWorkerTick() against the SHARED jobs table (to drive queued
// notification-deliver jobs to completion in tests), so it joins the same advisory-lock
// protocol as jobPlatform/webhookPlatform/eventBus test files — see jobs/testClaimLock.js.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import { query } from "../../db.js";
import {
  sendNotification,
  markRead,
  markUnread,
  dismissNotification,
  archiveNotification,
  cancelNotification,
} from "./core.js";
import { registerChannelProvider } from "./registry.js";
import { registerTemplate } from "../templates/core.js";
import { runWorkerTick } from "../jobs/core.js";
import "../jobs/handlers/index.js"; // full production handler set, including notification-deliver
import { acquireClaimTestLock, releaseClaimTestLock } from "../jobs/testClaimLock.js";
import { createTestUser, deleteTestUser } from "../../invest/testHelpers.js";

const RUN = crypto.randomBytes(3).toString("hex");
const T = (name) => `test-${RUN}-${name}`;

let userId;
const testChannel = T("channel"); // a throwaway async channel, registered once for this whole file
let deliveryOutcomes = []; // controls what testChannel.send() does per call, consumed in order

beforeAll(async () => {
  await acquireClaimTestLock();
  userId = await createTestUser(`notif-core-${RUN}`);

  registerChannelProvider(testChannel, {
    async send() {
      const outcome = deliveryOutcomes.shift() ?? "succeed";
      if (outcome === "fail") throw new Error("mock channel delivery failed");
      return { delivered: true };
    },
  });

  registerTemplate(T("greeting"), {
    source: "Hello {{name}}, your {{{thing}}} is ready.",
    sampleContext: { name: "Sample", thing: "report" },
  });
});

afterAll(async () => {
  try {
    await runWorkerTick({ workerId: `test-notif-core-${RUN}-final-drain`, maxJobs: 200, timeBudgetMs: 30000 });
  } catch (err) {
    console.error("core.test.js final drain failed (non-fatal, releasing lock anyway):", err);
  }
  await deleteTestUser(userId);
  await releaseClaimTestLock();
});

describe("sendNotification — in-app (synchronous)", () => {
  it("delivers immediately, recording created + delivered events", async () => {
    const result = await sendNotification(userId, { type: T("welcome"), title: "Welcome!", body: "Glad to have you." });
    expect(result.sent).toBe(true);
    expect(result.notification.status).toBe("delivered");
    expect(result.notification.channel).toBe("in_app");
    expect(result.notification.delivered_at).toBeTruthy();

    const events = await query(`select event from notification_events where notification_id = $1 order by created_at`, [result.notification.id]);
    expect(events.rows.map((r) => r.event)).toEqual(["created", "delivered"]);
  });

  it("requires a type", async () => {
    await expect(sendNotification(userId, { title: "x" })).rejects.toThrow(/type is required/);
  });

  it("requires a title, directly or via a template", async () => {
    await expect(sendNotification(userId, { type: T("no-title") })).rejects.toThrow(/title is required/);
  });

  it("resolves content via a registered template, recording the version used", async () => {
    const result = await sendNotification(userId, {
      type: T("templated"),
      templateName: T("greeting"),
      templateContext: { title: "A template-driven notification", name: "Asha", thing: "portfolio report" },
    });
    expect(result.notification.body).toBe("Hello Asha, your portfolio report is ready.");
    expect(result.notification.template_name).toBe(T("greeting"));
    expect(result.notification.template_version).toBe("1.0.0");
  });
});

describe("sendNotification — preference evaluation", () => {
  it("a channel not in the user's enabled_channels is silently skipped, not an error", async () => {
    await query(`insert into notification_preferences (user_id, enabled_channels) values ($1, array['in_app']) on conflict (user_id) do update set enabled_channels = excluded.enabled_channels`, [userId]);
    const result = await sendNotification(userId, { type: T("blocked"), title: "Should not send", channel: testChannel });
    expect(result).toEqual({ sent: false, reason: "channel_disabled" });
  });
});

describe("sendNotification — async channel (queued -> job -> delivered)", () => {
  it("queues, then a worker tick delivers it via the channel provider", async () => {
    await query(
      `insert into notification_preferences (user_id, enabled_channels) values ($1, array['in_app', $2])
       on conflict (user_id) do update set enabled_channels = excluded.enabled_channels`,
      [userId, testChannel]
    );
    deliveryOutcomes = ["succeed"];

    const result = await sendNotification(userId, { type: T("async-ok"), title: "Async delivery", channel: testChannel });
    expect(result.notification.status).toBe("queued");
    expect(result.notification.job_id).toBeTruthy();

    await runWorkerTick({ workerId: `test-notif-core-${RUN}`, maxJobs: 20 });

    const after = await query(`select status, delivered_at, attempts from notifications where id = $1`, [result.notification.id]);
    expect(after.rows[0]).toMatchObject({ status: "delivered", attempts: 1 });
    expect(after.rows[0].delivered_at).toBeTruthy();

    const events = await query(`select event from notification_events where notification_id = $1 order by created_at`, [result.notification.id]);
    expect(events.rows.map((r) => r.event)).toEqual(["created", "queued", "processing", "delivered"]);
  }, 120000);

  it("a persistently failing provider retries then dead-letters at max_attempts, with each transition audited", async () => {
    deliveryOutcomes = ["fail", "fail"]; // matches max_attempts: 2 below — never succeeds
    const result = await sendNotification(userId, { type: T("async-fail"), title: "Will fail", channel: testChannel });
    await query(`update notifications set max_attempts = 2 where id = $1`, [result.notification.id]);

    await runWorkerTick({ workerId: `test-notif-core-${RUN}-fail`, maxJobs: 20 });
    const afterFirst = await query(`select status, job_id from notifications where id = $1`, [result.notification.id]);
    expect(afterFirst.rows[0].status).toBe("retrying");

    // The job platform's default backoff (~30s for a first failure) would make this test slow
    // and non-deterministic to just wait out — backdate the underlying job's run_at instead, the
    // same real-elapsed-time bypass already established elsewhere in this codebase (e.g.
    // eventBus.test.js backdates submitted_at) for exercising real retry logic without a real wait.
    await query(`update jobs set run_at = now() where id = $1`, [afterFirst.rows[0].job_id]);
    await runWorkerTick({ workerId: `test-notif-core-${RUN}-fail`, maxJobs: 20 });

    const final = await query(`select status, attempts, last_error from notifications where id = $1`, [result.notification.id]);
    expect(final.rows[0]).toMatchObject({ status: "dead_letter", attempts: 2 });
    expect(final.rows[0].last_error).toMatch(/mock channel delivery failed/);

    const events = await query(`select event from notification_events where notification_id = $1 order by created_at`, [result.notification.id]);
    expect(events.rows.map((r) => r.event)).toEqual(["created", "queued", "processing", "retry_scheduled", "processing", "dead_lettered"]);
  }, 120000);
});

describe("user-facing state transitions", () => {
  it("markRead / markUnread round-trip, each recording exactly one event, idempotent no-op the second time", async () => {
    const { notification } = await sendNotification(userId, { type: T("read-cycle"), title: "Read me" });
    const read = await markRead(notification.id, userId);
    expect(read.read_at).toBeTruthy();
    expect(await markRead(notification.id, userId)).toBeNull(); // already read — no-op, not an error

    const unread = await markUnread(notification.id, userId);
    expect(unread.read_at).toBeNull();
    expect(await markUnread(notification.id, userId)).toBeNull();

    const events = await query(`select event from notification_events where notification_id = $1 order by created_at`, [notification.id]);
    expect(events.rows.map((r) => r.event)).toEqual(["created", "delivered", "read", "unread"]);
  });

  it("dismiss and archive are independent, idempotent, and both auditable", async () => {
    const { notification } = await sendNotification(userId, { type: T("dismiss-archive"), title: "x" });
    expect((await dismissNotification(notification.id, userId)).dismissed_at).toBeTruthy();
    expect(await dismissNotification(notification.id, userId)).toBeNull();
    expect((await archiveNotification(notification.id, userId)).archived_at).toBeTruthy();
    expect(await archiveNotification(notification.id, userId)).toBeNull();
  });

  it("none of the transitions can be performed by a different user (RBAC by construction)", async () => {
    const otherUserId = await createTestUser(`notif-core-other-${RUN}`);
    try {
      const { notification } = await sendNotification(userId, { type: T("rbac"), title: "Not yours" });
      expect(await markRead(notification.id, otherUserId)).toBeNull();
      expect(await dismissNotification(notification.id, otherUserId)).toBeNull();
      expect(await archiveNotification(notification.id, otherUserId)).toBeNull();
      const stillUnread = await query(`select read_at from notifications where id = $1`, [notification.id]);
      expect(stillUnread.rows[0].read_at).toBeNull();
    } finally {
      await deleteTestUser(otherUserId);
    }
  });

  it("cancelNotification only succeeds while still queued, never once delivered", async () => {
    const { notification: delivered } = await sendNotification(userId, { type: T("cancel-delivered"), title: "Already delivered" });
    expect(await cancelNotification(delivered.id, userId)).toBeNull(); // in_app is already 'delivered', not 'queued'

    await query(`insert into notification_preferences (user_id, enabled_channels) values ($1, array['in_app', $2]) on conflict (user_id) do update set enabled_channels = excluded.enabled_channels`, [userId, testChannel]);
    const { notification: queued } = await sendNotification(userId, { type: T("cancel-queued"), title: "Still queued", channel: testChannel });
    expect(queued.status).toBe("queued");
    const cancelled = await cancelNotification(queued.id, userId);
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.cancelled_at).toBeTruthy();

    // a cancelled notification's job must be a no-op if it still gets claimed
    await runWorkerTick({ workerId: `test-notif-core-${RUN}-cancel`, maxJobs: 20 });
    const after = await query(`select status from notifications where id = $1`, [queued.id]);
    expect(after.rows[0].status).toBe("cancelled"); // unchanged — deliverNotification() skips cancelled rows
  }, 60000);
});
