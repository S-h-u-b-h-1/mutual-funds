// Comparator registry. A comparator is the ONLY thing a new reconciliation needs:
//   registerComparator({
//     type:        'orders-vs-provider',        // unique name, used by schedules/runs
//     entityType:  'order',
//     loadPairs:   async (scope) => [{ key, internal, external }]
//        // key: stable entity identity; internal/external: null when that side is missing.
//        // Loading BOTH sides is the comparator's job — the engine never guesses where
//        // external truth comes from (mock provider today, BSE/RTA adapter later).
//     compare:     (internal, external) => ({ matched: boolean, diffs: [{field, internal, external}] })
//        // called only when both sides exist; missing sides are classified by the engine
//   })
const comparators = new Map();

export function registerComparator(config) {
  for (const field of ["type", "entityType", "loadPairs", "compare"]) {
    if (!config?.[field]) throw new Error(`Comparator is missing required field '${field}'.`);
  }
  comparators.set(config.type, config);
}

export function getComparator(type) {
  return comparators.get(type) ?? null;
}

export function registeredComparators() {
  return [...comparators.keys()].sort();
}
