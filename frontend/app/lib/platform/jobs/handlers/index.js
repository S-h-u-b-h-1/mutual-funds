// The production handler set. Importing this module registers every real handler exactly once
// (module side effect + Node module cache). The worker tick script and any API route that
// executes jobs must import this; tests that want ONLY throwaway handlers import registry.js
// directly instead.
import "./vaultRetentionSweep.js";
import "./jobHistoryPrune.js";

export { registeredTypes } from "../registry.js";
