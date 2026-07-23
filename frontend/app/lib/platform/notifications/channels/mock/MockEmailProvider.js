// Mock email channel (Phase 5 M5 sub-step 2). Never contacts Resend or any real ESP — per the
// standing constraint, only interfaces/mocks/adapters exist until official credentials arrive.
// Recipient address resolution (users.email or equivalent) is deliberately NOT modeled here: a
// mock has nothing to send an address to, and a real adapter is exactly where that lookup
// belongs — adding it now would be guessing at a real integration's shape before it exists.
import { NotificationProvider } from "../../types.js";
import { createCircuitBreaker } from "../../../circuitBreaker/core.js";
import { getProviderConfig } from "../../../config/core.js";
import { mockRef } from "../../../../invest/providers/mock/ids.js";
import { breakerHealth } from "./breakerHealth.js";

const PROVIDER_NAME = "notification-channel-email";

export class MockEmailProvider extends NotificationProvider {
  constructor() {
    super();
    const config = getProviderConfig(PROVIDER_NAME);
    this.breaker = createCircuitBreaker(PROVIDER_NAME, config.circuitBreaker);
  }

  async send(notification) {
    return this.breaker.execute(async () => ({
      delivered: true,
      provider: "mock-email",
      messageId: mockRef("email"),
      notificationId: notification.id,
    }));
  }

  getHealth() {
    return breakerHealth(this.breaker);
  }
}
