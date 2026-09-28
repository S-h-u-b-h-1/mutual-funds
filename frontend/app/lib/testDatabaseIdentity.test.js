import { afterEach, describe, expect, it, vi } from "vitest";
import { APPROVED_TEST_DATABASE, assertIdentityRow, assertConnectedTestDatabase } from "./testDatabaseIdentity.mjs";
import { assertSafeTestDatabase } from "./testDbGuard.js";

afterEach(() => vi.unstubAllEnvs());
describe("connected CI identity is fail-closed", () => {
  it("accepts only the approved complete identity", () => expect(assertIdentityRow(APPROVED_TEST_DATABASE, true)).toEqual(APPROVED_TEST_DATABASE));
  for (const key of ["project", "branch", "endpoint", "database", "role"]) {
    it(`rejects a different ${key}`, () => expect(() => assertIdentityRow({ ...APPROVED_TEST_DATABASE, [key]: "wrong" }, true)).toThrow());
    it(`rejects a missing ${key}`, () => expect(() => assertIdentityRow({ ...APPROVED_TEST_DATABASE, [key]: null }, true)).toThrow());
  }
  it("does not expose driver errors or connection strings", async () => {
    await expect(assertConnectedTestDatabase(async () => { throw Error("postgresql://secret@private/db"); })).rejects.toThrow(/^Refusing test database: connection or approved project\/branch\/database identity check failed\.$/);
  });
  for (const host of ["ep-autumn-wind-atiwaldh-pooler.c-9.us-east-1.aws.neon.tech", "ep-autumn-wind-atiwaldh.c-9.us-east-1.aws.neon.tech", "unapproved.example.com"]) {
    it(`refuses an unapproved host ${host}`, () => {
      const value = `postgresql://mf_pulse_ci_20260908:dummy@${host}/neondb`;
      vi.stubEnv("DATABASE_URL", value); vi.stubEnv("TEST_DATABASE_URL", value);
      expect(() => assertSafeTestDatabase()).toThrow();
    });
  }
  it("rejects session options that could spoof database identity", () => {
    const value = `postgresql://mf_pulse_ci_20260908:dummy@${APPROVED_TEST_DATABASE.host}/neondb?options=spoof`;
    vi.stubEnv("DATABASE_URL", value); vi.stubEnv("TEST_DATABASE_URL", value);
    expect(() => assertSafeTestDatabase()).toThrow();
  });
});
