// Mock SMS channel (Phase 5 M5 sub-step 2). Never contacts a real SMS gateway — blocked on TRAI
// DLT registration even once a vendor is chosen, per [[mfpulse-invest-phase3-gate]]. Only
// interfaces/mocks/adapters exist until that's done and official credentials arrive.
import { NotificationProvider } from "../../types.js";
import { createCircuitBreaker } from "../../../circuitBreaker/core.js";
import { getProviderConfig } from "../../../config/core.js";
import { mockRef } from "../../../../invest/providers/mock/ids.js";
import { breakerHealth } from "./breakerHealth.js";

const PROVIDER_NAME = "notification-channel-sms";

export class MockSMSProvider extends NotificationProvider {
  constructor() {
    super();
    const config = getProviderConfig(PROVIDER_NAME);
    this.breaker = createCircuitBreaker(PROVIDER_NAME, config.circuitBreaker);
  }

  async send(notification) {
    return this.breaker.execute(async () => ({
      delivered: true,
      provider: "mock-sms",
      messageId: mockRef("sms"),
      notificationId: notification.id,
    }));
  }

  getHealth() {
    return breakerHealth(this.breaker);
  }
}
