// Mock push channel (Phase 5 M5 sub-step 2). Never contacts Firebase/APNs or any real push
// gateway — device-token registration doesn't exist yet either, which a real adapter would need
// to add. Only interfaces/mocks/adapters exist until official credentials arrive.
import { NotificationProvider } from "../../types.js";
import { createCircuitBreaker } from "../../../circuitBreaker/core.js";
import { getProviderConfig } from "../../../config/core.js";
import { mockRef } from "../../../../invest/providers/mock/ids.js";
import { breakerHealth } from "./breakerHealth.js";

const PROVIDER_NAME = "notification-channel-push";

export class MockPushProvider extends NotificationProvider {
  constructor() {
    super();
    const config = getProviderConfig(PROVIDER_NAME);
    this.breaker = createCircuitBreaker(PROVIDER_NAME, config.circuitBreaker);
  }

  async send(notification) {
    return this.breaker.execute(async () => ({
      delivered: true,
      provider: "mock-push",
      messageId: mockRef("push"),
      notificationId: notification.id,
    }));
  }

  getHealth() {
    return breakerHealth(this.breaker);
  }
}
