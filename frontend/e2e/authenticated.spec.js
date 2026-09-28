import { test, expect } from "@playwright/test";
import pg from "pg";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { assertSafeTestDatabase } from "../app/lib/testDbGuard.js";
import { assertConnectedTestDatabase } from "../app/lib/testDatabaseIdentity.mjs";

test("credentials sign-in opens an unmistakable sandbox and private session", async ({ page, baseURL }) => {
  test.skip(!process.env.TEST_DATABASE_URL || !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(baseURL), "Positive-auth fixtures are restricted to an explicitly configured local test database; never create production test users.");
  assertSafeTestDatabase();
  const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, connectionTimeoutMillis: 15000 });
  const email = `invest-test-browser-${crypto.randomUUID()}@mfpulse.test`;
  const password = crypto.randomBytes(24).toString("base64url");
  let userId;
  try {
    await assertConnectedTestDatabase(pool.query.bind(pool));
    userId = (await pool.query("insert into users(name,email,password_hash) values($1,$2,$3) returning id", ["Disposable browser verification", email, await bcrypt.hash(password, 12)])).rows[0].id;
    await page.goto("/login?callbackUrl=%2Finvest");
    await page.getByRole("textbox", { name: "Email", exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in and continue", exact: true }).click();
    await expect(page.getByText("Demo / Sandbox — No real investment is executed.", { exact: false })).toBeVisible({ timeout: 30000 });
    const response = await page.request.get("/api/v1/invest/portfolio");
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ providerMode: "sandbox", executionMode: "simulated", realMoneyExecution: false });
    await page.goto("/invest/onboarding");
    await expect(page.getByText("Do not enter real identity or banking details here.", { exact: false })).toBeVisible();
  } finally {
    if (userId) await pool.query("delete from users where id=$1 and email=$2", [userId, email]);
    await pool.end();
  }
});
