// Internal event-listener registry. A listener is `async (payload, { event }) => result`,
// dispatched via an M1 job (retries/DLQ are the job platform's) — MUST be idempotent, same
// at-least-once contract as every other job handler in this platform. Listeners self-register
// by module side effect; jobs/handlers/index.js imports listeners/index.js to load the
// production set, matching the exact pattern comparators and webhook providers already use.
const listeners = new Map(); // eventType -> Map<name, handler>

export function registerEventListener(eventType, name, handler) {
  if (typeof handler !== "function") {
    throw new Error(`Event listener '${name}' for '${eventType}' must be a function.`);
  }
  if (!listeners.has(eventType)) listeners.set(eventType, new Map());
  listeners.get(eventType).set(name, handler);
}

export function getListenerNames(eventType) {
  return [...(listeners.get(eventType)?.keys() ?? [])];
}

export function getListenerHandler(eventType, name) {
  return listeners.get(eventType)?.get(name) ?? null;
}

// {eventType: [names]} — for the status endpoint.
export function registeredListenerSummary() {
  const summary = {};
  for (const [eventType, byName] of listeners) summary[eventType] = [...byName.keys()].sort();
  return summary;
}
