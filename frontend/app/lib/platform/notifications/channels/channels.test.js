// Notification channel conformance tests (Phase 5 M5 sub-step 2). Pure in-memory — no real
// Neon needed, since channel registration/circuit-breaker/send() plumbing never touches the
// database. Covers two layers: the generic Provider Registry conformance check (registration
// shape only — is this even a well-formed provider?) and a notification-specific behavioral
// check this module adds (does send() actually work, and is the circuit breaker really wired?)
// — the two pieces docs/NOTIFICATION_PLATFORM.md §3 promises ("passing the notification
// conformance suite" from the brief's own FINAL OBJECTIVE).
import { describe, it, expect } from "vitest";
import "./index.js"; // registers every channel as a module side effect
import { getChannelProvider, registeredChannels } from "../registry.js";
import { getProviderStatus, runProviderConformanceCheck } from "../../providerRegistry/core.js";

const ALL_CHANNELS = ["in_app", "email", "sms", "push", "whatsapp", "webhook"];
const MOCK_CHANNELS = ALL_CHANNELS.filter((c) => c !== "in_app");

const fakeNotification = { id: "00000000-0000-0000-0000-000000000000", title: "Conformance check" };

describe("channel registration", () => {
  it("registers exactly the 6 channels the brief names, in both registries", () => {
    expect(registeredChannels()).toEqual(ALL_CHANNELS.slice().sort());
    for (const channel of ALL_CHANNELS) {
      expect(getChannelProvider(channel)).toBeTruthy();
      expect(getProviderStatus(`notification-channel-${channel}`)).toBeTruthy();
    }
  });

  it("in_app is the only channel registered in 'production' mode", () => {
    expect(getProviderStatus("notification-channel-in_app").mode).toBe("production");
    for (const channel of MOCK_CHANNELS) {
      expect(getProviderStatus(`notification-channel-${channel}`).mode).toBe("sandbox");
    }
  });
});

describe("generic Provider Registry conformance (registration shape)", () => {
  it.each(ALL_CHANNELS)("notification-channel-%s passes runProviderConformanceCheck", (channel) => {
    const result = runProviderConformanceCheck(`notification-channel-${channel}`);
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
  });
});

describe("notification-specific behavioral conformance (does send() actually work)", () => {
  it.each(ALL_CHANNELS)("%s's send() resolves for a well-formed notification, without throwing", async (channel) => {
    const provider = getChannelProvider(channel);
    await expect(provider.send(fakeNotification)).resolves.toBeTruthy();
  });

  it.each(MOCK_CHANNELS)("%s's circuit breaker is genuinely wired: a send() moves its sampleSize", async (channel) => {
    const provider = getChannelProvider(channel);
    const before = provider.getHealth();
    expect(before.state).toBe("closed");
    const beforeSampleSize = before.sampleSize;

    await provider.send(fakeNotification);

    const after = provider.getHealth();
    expect(after.sampleSize).toBe(beforeSampleSize + 1);
    expect(after.failureRate).toBe(0); // mocks always succeed
  });

  it("in_app's health stays the interface default — it has no circuit breaker to report", () => {
    const provider = getChannelProvider("in_app");
    expect(provider.getHealth()).toEqual({ status: "healthy" });
  });
});
