// Channel provider registry (Phase 5 M5) — which concrete NotificationProvider backs each
// channel ('in_app', and from M5 sub-step 2 onward 'email'/'sms'/'push'/'whatsapp'/'webhook').
// Distinct from platform/providerRegistry/core.js: that module holds cross-cutting OPERATIONAL
// metadata (version/health/capabilities) any provider in the platform can register into; this
// one is the actual swap point holding invokable instances, same split as
// invest/providers/index.js (instances) vs. the Provider Registry (metadata about them).
const channels = new Map();

export function registerChannelProvider(channel, provider) {
  if (!channel || typeof channel !== "string") throw new Error("registerChannelProvider: channel is required");
  if (!provider || typeof provider.send !== "function") throw new Error("registerChannelProvider: provider.send() is required");
  channels.set(channel, provider);
}

export function getChannelProvider(channel) {
  return channels.get(channel) ?? null;
}

export function registeredChannels() {
  return Array.from(channels.keys()).sort();
}
