// The event bus's first real internal listener — proves "consumed internally, decoupled from
// the emitter" with genuinely new behavior, not a contrived example: complianceService has
// never notified a user the moment they become investment-ready (confirmed by reading it — it
// calls logAudit on every item submission, but nothing calls notifyUser for the derived gate).
// complianceService only emits InvestmentReady; it has no idea this listener — or any other —
// exists.
import { notifyUser } from "../../../invest/notifications.js";
import { registerEventListener } from "../registry.js";

export async function notifyInvestmentReady(payload) {
  await notifyUser(payload.userId, "investment_ready", {
    title: "You're investment-ready!",
    body: "Every compliance step is complete — you can place your first order.",
    relatedEntityType: "compliance",
  });
  return { notified: true };
}

registerEventListener("InvestmentReady", "notify-investor", notifyInvestmentReady);
