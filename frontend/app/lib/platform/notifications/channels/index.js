// Channel swap point (Phase 5 M5) — mirrors invest/providers/index.js exactly: the one place
// deciding which concrete implementation backs each channel. 'in_app' is genuinely real;
// email/sms/push/whatsapp/webhook (sub-step 2) are interface + mock adapter pairs, registered
// the same way, per the explicit constraint against integrating a real provider before official
// credentials exist. Every channel — mock or real — goes through the identical registration
// shape: instantiate, register into the channel registry (the invokable swap point), register
// into the Provider Registry (operational metadata, health read from the instance itself so
// this file never hand-copies per-channel health logic).
import { InAppNotificationProvider } from "./inApp.js";
import { MockEmailProvider } from "./mock/MockEmailProvider.js";
import { MockSMSProvider } from "./mock/MockSMSProvider.js";
import { MockPushProvider } from "./mock/MockPushProvider.js";
import { MockWhatsAppProvider } from "./mock/MockWhatsAppProvider.js";
import { MockWebhookProvider } from "./mock/MockWebhookProvider.js";
import { registerChannelProvider } from "../registry.js";
import { registerProvider, deriveCapabilities } from "../../providerRegistry/core.js";
import { getProviderConfig } from "../../config/core.js";
import { NotificationProvider } from "../types.js";

export const inAppChannel = new InAppNotificationProvider();
export const emailChannel = new MockEmailProvider();
export const smsChannel = new MockSMSProvider();
export const pushChannel = new MockPushProvider();
export const whatsappChannel = new MockWhatsAppProvider();
export const webhookChannel = new MockWebhookProvider();

const CAPABILITIES = deriveCapabilities(NotificationProvider);

// mode: 'production' only for in-app, which is genuinely real, not a mock standing in for an
// unavailable external system — every other channel is honestly reported 'sandbox' until a real
// adapter replaces its mock.
for (const [channel, provider, mode] of [
  ["in_app", inAppChannel, "production"],
  ["email", emailChannel, "sandbox"],
  ["sms", smsChannel, "sandbox"],
  ["push", pushChannel, "sandbox"],
  ["whatsapp", whatsappChannel, "sandbox"],
  ["webhook", webhookChannel, "sandbox"],
]) {
  registerChannelProvider(channel, provider);

  const providerRegistryName = `notification-channel-${channel}`;
  registerProvider(providerRegistryName, {
    version: mode === "production" ? "1.0.0" : "mock-1.0.0",
    capabilities: CAPABILITIES,
    mode,
    getHealth: () => provider.getHealth(),
    getConfig: () => getProviderConfig(providerRegistryName),
  });
}
