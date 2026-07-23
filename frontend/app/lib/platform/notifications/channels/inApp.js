import { NotificationProvider } from "../types.js";

// The only channel with a genuinely real (not mock) implementation — "delivering" an in-app
// notification IS writing its row to the notifications table, which sendNotification() already
// does before this is ever called; there is no further external call to make. Kept as a real
// provider object rather than special-cased away so in-app participates in the exact same
// registration/health/audit machinery every future channel will.
export class InAppNotificationProvider extends NotificationProvider {
  async send() {
    return { delivered: true };
  }
}
