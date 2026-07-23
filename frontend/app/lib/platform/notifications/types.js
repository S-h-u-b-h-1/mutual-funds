// Notification channel provider interface (Phase 5 M5). Mirrors the shape of
// frontend/app/lib/invest/providers/types.js — one abstract base class per capability, mock
// implementations only until real credentials exist for a given channel.
export class NotificationProvider {
  /** Deliver one notification row. Must throw on failure — the caller (core.js's job handler
   * for async channels, or the synchronous in-app path) owns the retry/status-transition
   * decision; this method's only contract is "did it work or not". Return value is ignored on
   * success. */
  async send(notification) { throw new Error("NotificationProvider.send not implemented"); }

  /** Operational health snapshot for the Provider Registry. Default assumes a provider with no
   * internal failure state to report (matches in-app: writing the row already succeeded by the
   * time send() runs, there's nothing further that can fail). A provider wrapping a real or
   * simulated external call should override this with its own circuit breaker's getMetrics(),
   * the same convention every other provider family in this platform uses. */
  getHealth() { return { status: "healthy" }; }
}
