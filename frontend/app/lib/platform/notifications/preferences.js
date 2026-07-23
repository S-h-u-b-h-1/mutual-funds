// Notification Preferences (Phase 5 M5 Slice 3). Owns everything about WHICH channels a user
// receives notifications on, per-category — reading (getPreferences), writing (upsertPreferences,
// validated, partial-update semantics), and the inheritance rule sendNotification() consults
// (resolveChannelEnabled). Split out of core.js because this is now a real, independently
// documented vertical (channel/category prefs, defaults, inheritance, validation, APIs), not a
// one-function detail of the send pipeline — core.js imports from here, nothing moved the other
// way. See docs/NOTIFICATION_PLATFORM.md for the inheritance model and what's deliberately still
// deferred (quiet-hours/digest enforcement — Slice 5, Scheduling).
import { query } from "../../db.js";

export const KNOWN_CHANNELS = Object.freeze(["in_app", "email", "sms", "push", "whatsapp", "webhook"]);

// The brief's own "Notification Types" list, offered as suggested category labels for a
// preferences UI — NOT a hard constraint on category_settings' keys. A notification's own
// `category` field (today mostly relatedEntityType values like 'order'/'document'/'compliance',
// set by notifyUser()) stays free-form, matching every other "type" string already in this
// codebase (job types, reconciliation types, event types are all catalog-free or catalog-open).
// A caller can set an override for ANY category key their notifications actually use; this list
// just gives a settings screen sensible defaults to render toggles for.
export const SUGGESTED_CATEGORIES = Object.freeze([
  "transactional", "system", "security", "compliance", "portfolio",
  "investment", "advisor", "marketing", "operational", "administrative",
]);

const DIGEST_FREQUENCIES = Object.freeze(["daily", "weekly"]);

export const DEFAULT_PREFERENCES = Object.freeze({
  enabled_channels: ["in_app"],
  category_settings: {},
  quiet_hours_start: null,
  quiet_hours_end: null,
  quiet_hours_timezone: "Asia/Kolkata",
  digest_enabled: false,
  digest_frequency: "daily",
  language: "en",
});

/** Absence of a row means "all defaults" (in-app only, no quiet hours) rather than requiring a
 * preferences row to exist before a user can receive anything — see notification_preferences'
 * own schema comment. */
export async function getPreferences(userId) {
  const r = await query(`select * from notification_preferences where user_id = $1`, [userId]);
  return r.rows[0] ?? { user_id: userId, ...DEFAULT_PREFERENCES };
}

/**
 * Preference inheritance: a category with an explicit override in category_settings is
 * authoritative for that category — full stop, whether that NARROWS or WIDENS access relative to
 * enabled_channels. Widening matters for real cases the brief names (e.g. "Security Notification
 * Rules" should be able to force email/SMS through even if a user has disabled those channels
 * globally to cut down on noise). A category with no override simply inherits the global default.
 * This is standard prototype-style inheritance (a locally-set value wins outright), not a
 * narrowing intersection.
 */
export function resolveChannelEnabled(preferences, category, channel) {
  const override = category ? preferences.category_settings?.[category] : null;
  if (override) {
    if (override.enabled === false) return false;
    if (Array.isArray(override.channels)) return override.channels.includes(channel);
  }
  return (preferences.enabled_channels ?? DEFAULT_PREFERENCES.enabled_channels).includes(channel);
}

function validateHour(field, value) {
  if (value === null) return null;
  if (!Number.isInteger(value) || value < 0 || value > 23) {
    throw new Error(`upsertPreferences: ${field} must be an integer 0-23 or null`);
  }
  return value;
}

/** Validates a PARTIAL update object — only keys actually present are checked and returned, so
 * upsertPreferences can merge onto whatever's already stored (or the defaults) without callers
 * needing to resend the whole preferences object for a single toggle. */
function validatePreferencesInput(updates) {
  const result = {};

  if (updates.enabled_channels !== undefined) {
    const bad = !Array.isArray(updates.enabled_channels) || updates.enabled_channels.some((c) => !KNOWN_CHANNELS.includes(c));
    if (bad) throw new Error(`upsertPreferences: enabled_channels must be an array drawn from ${KNOWN_CHANNELS.join(", ")}`);
    result.enabled_channels = [...new Set(updates.enabled_channels)];
  }

  if (updates.category_settings !== undefined) {
    const { category_settings } = updates;
    if (typeof category_settings !== "object" || category_settings === null || Array.isArray(category_settings)) {
      throw new Error("upsertPreferences: category_settings must be an object keyed by category");
    }
    for (const [category, setting] of Object.entries(category_settings)) {
      if (typeof setting !== "object" || setting === null || Array.isArray(setting)) {
        throw new Error(`upsertPreferences: category_settings.${category} must be an object`);
      }
      if (setting.enabled !== undefined && typeof setting.enabled !== "boolean") {
        throw new Error(`upsertPreferences: category_settings.${category}.enabled must be a boolean`);
      }
      if (setting.channels !== undefined) {
        const bad = !Array.isArray(setting.channels) || setting.channels.some((c) => !KNOWN_CHANNELS.includes(c));
        if (bad) throw new Error(`upsertPreferences: category_settings.${category}.channels must be an array drawn from ${KNOWN_CHANNELS.join(", ")}`);
      }
    }
    result.category_settings = category_settings;
  }

  if (updates.quiet_hours_start !== undefined) result.quiet_hours_start = validateHour("quiet_hours_start", updates.quiet_hours_start);
  if (updates.quiet_hours_end !== undefined) result.quiet_hours_end = validateHour("quiet_hours_end", updates.quiet_hours_end);

  if (updates.quiet_hours_timezone !== undefined) {
    if (typeof updates.quiet_hours_timezone !== "string" || !updates.quiet_hours_timezone) {
      throw new Error("upsertPreferences: quiet_hours_timezone must be a non-empty string");
    }
    result.quiet_hours_timezone = updates.quiet_hours_timezone;
  }

  if (updates.digest_enabled !== undefined) {
    if (typeof updates.digest_enabled !== "boolean") throw new Error("upsertPreferences: digest_enabled must be a boolean");
    result.digest_enabled = updates.digest_enabled;
  }

  if (updates.digest_frequency !== undefined) {
    if (!DIGEST_FREQUENCIES.includes(updates.digest_frequency)) {
      throw new Error(`upsertPreferences: digest_frequency must be one of ${DIGEST_FREQUENCIES.join(", ")}`);
    }
    result.digest_frequency = updates.digest_frequency;
  }

  if (updates.language !== undefined) {
    if (typeof updates.language !== "string" || !/^[a-z]{2}(-[A-Z]{2})?$/.test(updates.language)) {
      throw new Error("upsertPreferences: language must be an ISO 639-1 code, e.g. 'en', 'hi', 'en-IN'");
    }
    result.language = updates.language;
  }

  return result;
}

/** Partial update: validates only the provided keys, merges onto the current row (or defaults),
 * and upserts. Returns the saved row. */
export async function upsertPreferences(userId, updates = {}) {
  if (!userId) throw new Error("upsertPreferences: userId is required");
  const validated = validatePreferencesInput(updates);

  const current = await getPreferences(userId);
  const merged = { ...DEFAULT_PREFERENCES, ...current, ...validated };

  const r = await query(
    `insert into notification_preferences
       (user_id, enabled_channels, category_settings, quiet_hours_start, quiet_hours_end,
        quiet_hours_timezone, digest_enabled, digest_frequency, language, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
     on conflict (user_id) do update set
       enabled_channels = excluded.enabled_channels,
       category_settings = excluded.category_settings,
       quiet_hours_start = excluded.quiet_hours_start,
       quiet_hours_end = excluded.quiet_hours_end,
       quiet_hours_timezone = excluded.quiet_hours_timezone,
       digest_enabled = excluded.digest_enabled,
       digest_frequency = excluded.digest_frequency,
       language = excluded.language,
       updated_at = now()
     returning *`,
    [
      userId,
      merged.enabled_channels,
      JSON.stringify(merged.category_settings),
      merged.quiet_hours_start,
      merged.quiet_hours_end,
      merged.quiet_hours_timezone,
      merged.digest_enabled,
      merged.digest_frequency,
      merged.language,
    ]
  );
  return r.rows[0];
}
