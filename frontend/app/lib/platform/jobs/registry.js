// Job handler registry. A handler is `async (payload, { job }) => result` and MUST be
// idempotent (the platform is at-least-once — see core.js header). Handlers self-register by
// module side effect; importing handlers/index.js loads the full production set. Kept as its
// own module (not part of core.js) so core never depends on any concrete handler and tests
// can register throwaway handlers without touching production ones.
const handlers = new Map();

export function registerHandler(type, fn) {
  if (typeof fn !== "function") throw new Error(`Handler for '${type}' must be a function.`);
  handlers.set(type, fn);
}

export function getHandler(type) {
  return handlers.get(type) ?? null;
}

export function registeredTypes() {
  return [...handlers.keys()].sort();
}
