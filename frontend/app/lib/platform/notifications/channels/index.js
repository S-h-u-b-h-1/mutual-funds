// Channel swap point (Phase 5 M5) — mirrors invest/providers/index.js exactly: the one place
// deciding which concrete implementation backs each channel. Only 'in_app' exists as of M5
// sub-step 1; sub-step 2 adds email/sms/push/whatsapp/webhook as interface + mock adapter pairs
// registered the same way, per the explicit constraint against integrating a real provider
// before official credentials exist.
import { InAppNotificationProvider } from "./inApp.js";
import { registerChannelProvider } from "../registry.js";
import { registerProvider, deriveCapabilities } from "../../providerRegistry/core.js";
import { getProviderConfig } from "../../config/core.js";
import { NotificationProvider } from "../types.js";

export const inAppChannel = new InAppNotificationProvider();
registerChannelProvider("in_app", inAppChannel);

// Operational registration into the Provider Registry (Phase 4.5 step 4) — additive metadata,
// not a second swap mechanism. mode: 'production' because in-app is genuinely real, not a mock
// standing in for an unavailable external system.
registerProvider("notification-channel-in_app", {
  version: "1.0.0",
  capabilities: deriveCapabilities(NotificationProvider),
  mode: "production",
  getHealth: () => ({ status: "healthy" }),
  getConfig: () => getProviderConfig("notification-channel-in_app"),
});
