// Incoming-webhook provider registry. A future real provider (BSE order-status pushes,
// payment-gateway callbacks, KYC status updates) implements ONLY this registration — the
// endpoint route, verification, dedup, persistence, retries, and DLQ are all platform.
//
// registerWebhookProvider(provider, {
//   handler:        async (payload, { delivery }) => result   // REQUIRED, idempotent (jobs
//                                                             // platform is at-least-once)
//   verify:         ({ rawBody, headers, endpoint }) => {valid, reason}  // only for
//                   signature_scheme='custom' — written from the provider's OFFICIAL docs
//   extractEventId: (payload, headers) => string|null   // provider's event id for dedup;
//                                                       // default: payload.id ?? payload.event_id
//   extractEventType: (payload, headers) => string|null // default: payload.type ?? payload.event
// })
const providers = new Map();

export function registerWebhookProvider(provider, config) {
  if (typeof config?.handler !== "function") {
    throw new Error(`Webhook provider '${provider}' must register a handler function.`);
  }
  providers.set(provider, {
    extractEventId: (payload) => payload?.id ?? payload?.event_id ?? null,
    extractEventType: (payload) => payload?.type ?? payload?.event ?? null,
    ...config,
  });
}

export function getWebhookProvider(provider) {
  return providers.get(provider) ?? null;
}

export function registeredWebhookProviders() {
  return [...providers.keys()].sort();
}
