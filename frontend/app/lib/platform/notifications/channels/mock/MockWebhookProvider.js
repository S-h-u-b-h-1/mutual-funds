// Mock webhook channel (Phase 5 M5 sub-step 2, "future-ready" per the brief) — a NOTIFICATION
// delivered by POSTing it to a destination the recipient controls. Distinct from M2's outbound
// webhooks (platform/webhooks/core.js's emitOutboundEvent): those fire on DOMAIN EVENTS
// (OrderCompleted, etc.) to integration partners; this is a delivery CHANNEL for individual
// notifications, chosen the same way email/SMS/push are. They may end up sharing a real HTTP
// delivery adapter later, but that's an implementation detail for whichever real adapter lands
// first — kept as two separate concerns here, matching how the brief lists them separately.
// Never performs a real HTTP call — only interfaces/mocks/adapters exist until a real per-user
// webhook-destination model and credentials exist.
import { NotificationProvider } from "../../types.js";
import { createCircuitBreaker } from "../../../circuitBreaker/core.js";
import { getProviderConfig } from "../../../config/core.js";
import { mockRef } from "../../../../invest/providers/mock/ids.js";
import { breakerHealth } from "./breakerHealth.js";

const PROVIDER_NAME = "notification-channel-webhook";

export class MockWebhookProvider extends NotificationProvider {
  constructor() {
    super();
    const config = getProviderConfig(PROVIDER_NAME);
    this.breaker = createCircuitBreaker(PROVIDER_NAME, config.circuitBreaker);
  }

  async send(notification) {
    return this.breaker.execute(async () => ({
      delivered: true,
      provider: "mock-webhook",
      deliveryId: mockRef("whk"),
      notificationId: notification.id,
    }));
  }

  getHealth() {
    return breakerHealth(this.breaker);
  }
}
