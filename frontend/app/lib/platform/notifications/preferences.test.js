// Notification Preferences tests (Phase 5 M5 Slice 3) — real Neon, no mocks. Pure data/validation
// logic, no job platform or channel providers involved, so this file needs neither the advisory
// lock (jobs/testClaimLock.js) nor the full handler set other notification test files import.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import { query } from "../../db.js";
import { getPreferences, upsertPreferences, resolveChannelEnabled, DEFAULT_PREFERENCES, KNOWN_CHANNELS } from "./preferences.js";
import { createTestUser, deleteTestUser } from "../../invest/testHelpers.js";

const RUN = crypto.randomBytes(3).toString("hex");
let userId;

beforeAll(async () => {
  userId = await createTestUser(`notif-prefs-${RUN}`);
});

afterAll(async () => {
  await deleteTestUser(userId);
});

describe("getPreferences", () => {
  it("returns schema defaults when no row exists, without creating one", async () => {
    const otherUserId = await createTestUser(`notif-prefs-empty-${RUN}`);
    try {
      const prefs = await getPreferences(otherUserId);
      expect(prefs).toMatchObject(DEFAULT_PREFERENCES);
      const row = await query(`select 1 from notification_preferences where user_id = $1`, [otherUserId]);
      expect(row.rows.length).toBe(0);
    } finally {
      await deleteTestUser(otherUserId);
    }
  });
});

describe("upsertPreferences — validation", () => {
  it("rejects an unknown channel in enabled_channels", async () => {
    await expect(upsertPreferences(userId, { enabled_channels: ["in_app", "carrier_pigeon"] })).rejects.toThrow(/enabled_channels/);
  });

  it("rejects an unknown channel inside a category override", async () => {
    await expect(upsertPreferences(userId, { category_settings: { security: { channels: ["fax"] } } })).rejects.toThrow(/category_settings/);
  });

  it("rejects a non-boolean category enabled flag", async () => {
    await expect(upsertPreferences(userId, { category_settings: { security: { enabled: "yes" } } })).rejects.toThrow(/category_settings/);
  });

  it("rejects an out-of-range quiet hour", async () => {
    await expect(upsertPreferences(userId, { quiet_hours_start: 24 })).rejects.toThrow(/quiet_hours_start/);
    await expect(upsertPreferences(userId, { quiet_hours_start: -1 })).rejects.toThrow(/quiet_hours_start/);
  });

  it("accepts null to clear a quiet hour", async () => {
    const prefs = await upsertPreferences(userId, { quiet_hours_start: null });
    expect(prefs.quiet_hours_start).toBeNull();
  });

  it("rejects an invalid digest_frequency", async () => {
    await expect(upsertPreferences(userId, { digest_frequency: "hourly" })).rejects.toThrow(/digest_frequency/);
  });

  it("rejects a malformed language code", async () => {
    await expect(upsertPreferences(userId, { language: "English" })).rejects.toThrow(/language/);
  });

  it("none of the rejected calls above wrote anything — reads back untouched defaults", async () => {
    const otherUserId = await createTestUser(`notif-prefs-untouched-${RUN}`);
    try {
      await expect(upsertPreferences(otherUserId, { enabled_channels: ["bogus"] })).rejects.toThrow();
      const prefs = await getPreferences(otherUserId);
      expect(prefs).toMatchObject(DEFAULT_PREFERENCES);
    } finally {
      await deleteTestUser(otherUserId);
    }
  });
});

describe("upsertPreferences — partial-update semantics", () => {
  it("a call touching only one field leaves every other field at its prior value", async () => {
    const setupUserId = await createTestUser(`notif-prefs-partial-${RUN}`);
    try {
      await upsertPreferences(setupUserId, { enabled_channels: ["in_app", "email"], language: "hi" });
      const afterFirst = await upsertPreferences(setupUserId, { digest_enabled: true });

      expect(afterFirst.enabled_channels.sort()).toEqual(["email", "in_app"]);
      expect(afterFirst.language).toBe("hi");
      expect(afterFirst.digest_enabled).toBe(true);
    } finally {
      await deleteTestUser(setupUserId);
    }
  });

  it("round-trips category_settings through jsonb exactly", async () => {
    const setting = { security: { enabled: true, channels: ["in_app", "email", "sms"] }, marketing: { enabled: false } };
    const prefs = await upsertPreferences(userId, { category_settings: setting });
    expect(prefs.category_settings).toEqual(setting);

    const reread = await getPreferences(userId);
    expect(reread.category_settings).toEqual(setting);
  });

  it("de-duplicates enabled_channels", async () => {
    const prefs = await upsertPreferences(userId, { enabled_channels: ["in_app", "email", "email"] });
    expect(prefs.enabled_channels.sort()).toEqual(["email", "in_app"]);
  });
});

describe("resolveChannelEnabled — inheritance", () => {
  it("inherits the global default when a category has no override", () => {
    const prefs = { enabled_channels: ["in_app", "email"], category_settings: {} };
    expect(resolveChannelEnabled(prefs, "order", "email")).toBe(true);
    expect(resolveChannelEnabled(prefs, "order", "sms")).toBe(false);
    expect(resolveChannelEnabled(prefs, null, "email")).toBe(true);
  });

  it("a category override with enabled:false blocks every channel for that category, even in_app-style channels not otherwise gated", () => {
    const prefs = { enabled_channels: KNOWN_CHANNELS, category_settings: { marketing: { enabled: false } } };
    for (const channel of KNOWN_CHANNELS) {
      expect(resolveChannelEnabled(prefs, "marketing", channel)).toBe(false);
    }
    expect(resolveChannelEnabled(prefs, "transactional", "email")).toBe(true); // unaffected category
  });

  it("a category override can NARROW below the global default", () => {
    const prefs = { enabled_channels: ["in_app", "email", "sms"], category_settings: { marketing: { channels: ["in_app"] } } };
    expect(resolveChannelEnabled(prefs, "marketing", "in_app")).toBe(true);
    expect(resolveChannelEnabled(prefs, "marketing", "email")).toBe(false);
  });

  it("a category override can WIDEN beyond the global default (e.g. security bypassing a narrower global setting)", () => {
    const prefs = { enabled_channels: ["in_app"], category_settings: { security: { channels: ["in_app", "email", "sms"] } } };
    expect(resolveChannelEnabled(prefs, "security", "email")).toBe(true);
    expect(resolveChannelEnabled(prefs, "security", "sms")).toBe(true);
    expect(resolveChannelEnabled(prefs, "portfolio", "email")).toBe(false); // uncategorized still inherits global
  });
});
