// Mock WhatsApp channel (Phase 5 M5 sub-step 2, "future-ready" per the brief). Never contacts
// the WhatsApp Business API — only interfaces/mocks/adapters exist until official credentials
// (and Meta Business verification) are in place.
import { NotificationProvider } from "../../types.js";
import { createCircuitBreaker } from "../../../circuitBreaker/core.js";
import { getProviderConfig } from "../../../config/core.js";
import { mockRef } from "../../../../invest/providers/mock/ids.js";
import { breakerHealth } from "./breakerHealth.js";

const PROVIDER_NAME = "notification-channel-whatsapp";

export class MockWhatsAppProvider extends NotificationProvider {
  constructor() {
    super();
    const config = getProviderConfig(PROVIDER_NAME);
    this.breaker = createCircuitBreaker(PROVIDER_NAME, config.circuitBreaker);
  }

  async send(notification) {
    return this.breaker.execute(async () => ({
      delivered: true,
      provider: "mock-whatsapp",
      messageId: mockRef("wa"),
      notificationId: notification.id,
    }));
  }

  getHealth() {
    return breakerHealth(this.breaker);
  }
}
