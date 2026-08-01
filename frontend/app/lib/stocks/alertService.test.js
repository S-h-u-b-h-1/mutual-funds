import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { createAlert, getAlerts, triggerAlert, disableAlert } from "./alertService.js";
import { createTestCompany, deleteTestCompany } from "./testHelpers.js";
import { createTestUser, deleteTestUser } from "../invest/testHelpers.js";

describe("alertService (integration, real Neon, disposable user + company)", () => {
  let userId, companyId;

  beforeAll(async () => {
    userId = await createTestUser("stock-alerts");
    companyId = await createTestCompany({ label: "alerts" });
  });

  afterAll(async () => {
    await deleteTestCompany(companyId);
    await deleteTestUser(userId);
  });

  it("rejects an invalid alertType", async () => {
    await expect(createAlert({ userId, companyId, alertType: "buy_now" })).rejects.toThrow(/invalid alertType/);
  });

  it("requires threshold value+direction for a price_threshold alert specifically", async () => {
    await expect(createAlert({ userId, companyId, alertType: "price_threshold" })).rejects.toThrow(/requires thresholdValue and thresholdDirection/);
    const alert = await createAlert({ userId, companyId, alertType: "price_threshold", thresholdValue: 500, thresholdDirection: "above" });
    expect(alert.status).toBe("active");
    expect(alert.thresholdValue).toBe(500);
  });

  it("does not require a threshold for a factual-event alert type", async () => {
    const alert = await createAlert({ userId, companyId, alertType: "result_published" });
    expect(alert.thresholdValue).toBeNull();
    expect(alert.status).toBe("active");
  });

  it("lists alerts, optionally filtered by status, and transitions active -> triggered / disabled", async () => {
    const active = await getAlerts(userId, { status: "active" });
    expect(active.length).toBeGreaterThanOrEqual(2);

    const toTrigger = active[0];
    const triggered = await triggerAlert(toTrigger.id);
    expect(triggered.status).toBe("triggered");
    expect(triggered.triggeredAt).not.toBeNull();

    // Triggering an already-triggered alert is a no-op, not a second trigger.
    const noop = await triggerAlert(toTrigger.id);
    expect(noop).toBeNull();

    const disabled = await disableAlert(active[1].id);
    expect(disabled.status).toBe("disabled");
  });
});
