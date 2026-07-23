// Notification channel provider interface (Phase 5 M5). Mirrors the shape of
// frontend/app/lib/invest/providers/types.js — one abstract base class per capability, mock
// implementations only until real credentials exist for a given channel.
export class NotificationProvider {
  /** Deliver one notification row. Must throw on failure — the caller (core.js's job handler
   * for async channels, or the synchronous in-app path) owns the retry/status-transition
   * decision; this method's only contract is "did it work or not". Return value is ignored on
   * success. */
  async send(notification) { throw new Error("NotificationProvider.send not implemented"); }
}
