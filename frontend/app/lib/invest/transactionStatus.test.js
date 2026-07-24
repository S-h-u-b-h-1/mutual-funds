import { describe, expect, it } from "vitest";
import { ORDER_STAGES, orderStatusMeta } from "./transactionStatus";

describe("transaction status mapping", () => {
  it("contains only the lifecycle stages supported by the current order contract", () => {
    expect(ORDER_STAGES).toEqual(["draft", "submitted", "processing", "units_pending", "completed"]);
  });

  it("provides truthful copy for terminal and recovery states", () => {
    expect(orderStatusMeta("retry_required")[0]).toBe("Retry required");
    expect(orderStatusMeta("reversed")[0]).toBe("Reversed");
  });

  it("does not expose an unsupported provider state", () => {
    expect(orderStatusMeta("payment_received")[0]).toBe("Provider update");
  });
});
