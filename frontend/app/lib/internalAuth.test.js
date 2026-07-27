import { describe, it, expect, afterEach } from "vitest";
import { checkInternalSecret } from "./internalAuth.js";

const ENV_VAR = "TEST_INTERNAL_SECRET_VAR";

function requestWith(headerValue) {
  return { headers: new Headers(headerValue != null ? { "x-internal-secret": headerValue } : {}) };
}

afterEach(() => {
  delete process.env[ENV_VAR];
});

describe("checkInternalSecret", () => {
  it("returns 503 when the named env var isn't configured at all", async () => {
    const denied = checkInternalSecret(requestWith("anything"), ENV_VAR);
    expect(denied).not.toBeNull();
    expect(denied.status).toBe(503);
  });

  it("returns 401 when the header is missing", async () => {
    process.env[ENV_VAR] = "the-real-secret";
    const denied = checkInternalSecret(requestWith(null), ENV_VAR);
    expect(denied.status).toBe(401);
  });

  it("returns 401 when the header doesn't match", async () => {
    process.env[ENV_VAR] = "the-real-secret";
    const denied = checkInternalSecret(requestWith("wrong-guess"), ENV_VAR);
    expect(denied.status).toBe(401);
  });

  it("returns null (authorized) when the header matches exactly", async () => {
    process.env[ENV_VAR] = "the-real-secret";
    const denied = checkInternalSecret(requestWith("the-real-secret"), ENV_VAR);
    expect(denied).toBeNull();
  });

  it("different env var names are independent — a secret valid for one does not authorize another", async () => {
    process.env[ENV_VAR] = "secret-a";
    process.env.TEST_INTERNAL_SECRET_VAR_B = "secret-b";
    try {
      const deniedForB = checkInternalSecret(requestWith("secret-a"), "TEST_INTERNAL_SECRET_VAR_B");
      expect(deniedForB.status).toBe(401);
    } finally {
      delete process.env.TEST_INTERNAL_SECRET_VAR_B;
    }
  });
});
