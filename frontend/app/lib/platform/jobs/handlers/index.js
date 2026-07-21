// The production handler set. Importing this module registers every real handler exactly once
// (module side effect + Node module cache). The worker tick script and any API route that
// executes jobs must import this; tests that want ONLY throwaway handlers import registry.js
// directly instead.
import "./vaultRetentionSweep.js";
import "./jobHistoryPrune.js";
// M2 webhook platform: registers 'webhook-process' + 'webhook-outbound-deliver' job types and
// the incoming provider handlers they dispatch to.
import "../../webhooks/core.js";
import "../../webhooks/providers/mockPayments.js";
// M3 reconciliation engine: registers the 'reconciliation-run' job type + every comparator.
import "../../reconciliation/core.js";
import "../../reconciliation/comparators/index.js";
// M4 event bus: registers the 'event-dispatch' job type + every internal listener.
import "../../events/core.js";
import "../../events/listeners/index.js";

export { registeredTypes } from "../registry.js";
