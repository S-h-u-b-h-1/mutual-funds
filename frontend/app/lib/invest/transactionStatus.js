export const ORDER_STAGES = ["draft", "submitted", "processing", "units_pending", "completed"];

export const ORDER_LABELS = {
  draft: "Draft",
  submitted: "Investment submitted",
  processing: "Sent for processing",
  units_pending: "Units allotment pending",
  completed: "Completed",
};

export const ORDER_STATUS_META = {
  draft: ["Draft saved", "Review and submit when you are ready."],
  submitted: ["Investment submitted", "The order has been accepted by the provider."],
  processing: ["Being processed", "Provider processing is underway; this view refreshes automatically."],
  units_pending: ["Units allotment pending", "The order is too far along to cancel while units are being allotted."],
  completed: ["Completed", "Units have been allotted."],
  failed: ["Order failed", "The provider could not complete this order. Review the reason and try again if available."],
  retry_required: ["Retry required", "The provider has asked for this order to be submitted again."],
  cancelled: ["Cancelled", "This order was cancelled before completion."],
  reversed: ["Reversed", "This completed order was explicitly reversed by the provider."],
};

export function orderStatusMeta(status) {
  return ORDER_STATUS_META[status] || ["Provider update", "The provider returned a state that this experience does not yet expose. Refresh to check again."];
}
