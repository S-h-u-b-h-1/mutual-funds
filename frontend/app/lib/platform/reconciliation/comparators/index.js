// The production comparator set (imported by jobs/handlers/index.js alongside job handlers).
import "./documentsVaultIntegrity.js";
import "./ordersProviderLinkage.js";
import "./holdingsVsProvider.js";
import "./webhookProcessingLag.js";

export { registeredComparators } from "../registry.js";
