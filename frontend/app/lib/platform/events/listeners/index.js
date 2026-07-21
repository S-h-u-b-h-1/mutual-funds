// The production internal-listener set. Importing this module registers every real listener
// exactly once (module side effect), matching the exact pattern comparators/index.js (M3) and
// providers/mockPayments.js (M2) already use.
import "./investmentReadyNotification.js";

export { registeredListenerSummary } from "../registry.js";
