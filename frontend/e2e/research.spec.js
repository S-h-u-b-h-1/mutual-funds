import { test, expect } from "@playwright/test";

for (const width of [320, 375, 390, 768, 1024, 1200, 1279, 1280, 1440, 1920]) {
  test(`search opens, returns a scheme, closes and restores focus at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const launcher = page.getByRole("button", { name: "Open global search", exact: true }).filter({ visible: true }).first();
    await launcher.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const input = dialog.getByPlaceholder("Search funds, stocks, sectors, learn, portfolio…");
    await input.fill("100033");
    await expect(dialog.getByText("Search Results (1)", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(launcher).toBeFocused();
    await launcher.click();
    await expect(dialog).toBeVisible();
    await page.mouse.click(2, 2);
    await expect(dialog).not.toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
}

for (const code of ["100033", "100046", "120503", "125497", "135762", "150523", "154658"]) {
  test(`fund detail ${code} renders without a server or browser crash`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const response = await page.goto(`/fund/${code}`);
    expect(response.status()).toBe(200);
    // Next's streamed replacement segment can briefly coexist with its hidden predecessor.
    // Assert the final DOM after navigation settles, not an intermediate transport fragment.
    await page.waitForLoadState("networkidle", { timeout: 15000 });
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.getByText("Application error", { exact: false })).toHaveCount(0);
    if (errors.length) console.error(`Fund ${code} browser errors:`, errors);
    expect(errors).toEqual([]);
  });
}

for (const path of ["/funds", "/compare", "/data-status", "/news", "/brief", "/signals", "/login", "/portfolio", "/invest", "/stocks"]) {
  for (const width of [390, 1440]) {
    test(`${path} loads without overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const response = await page.goto(path);
      expect(response.status()).toBe(200);
      await expect(page.locator("h1").first()).toBeVisible();
      const overflowing = await page.evaluate(() => Array.from(document.querySelectorAll("main *"))
        .filter(el => el.getBoundingClientRect().right > innerWidth + 1)
        .slice(0, 5).map(el => ({ tag: el.tagName, className: el.className, right: el.getBoundingClientRect().right })));
      if (overflowing.length) console.error("Horizontal overflow diagnostics:", overflowing);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      if (path === "/invest") {
        await expect(page.getByText(/No real investment is executed|Sign in required|Welcome back to MF Pulse/).first()).toBeVisible();
      }
    });
  }
}

test("protected APIs deny logged-out access; malformed stock identifier is not a server error", async ({ request }) => {
  for (const path of ["/api/v1/portfolio/holdings", "/api/v1/portfolio/intelligence", "/api/v1/invest/portfolio", "/api/v1/sync/notes", "/api/v1/invest/documents"]) {
    expect((await request.get(path)).status()).toBe(401);
  }
  expect((await request.get("/api/v1/stocks/RELIANCE/financials")).status()).toBe(400);
});

test("search keyboard navigation survives resize and browser back", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open global search", exact: true }).filter({ visible: true }).first().click();
  const dialog = page.getByRole("dialog");
  const input = dialog.getByPlaceholder("Search funds, stocks, sectors, learn, portfolio…");
  await expect(input).toBeFocused();
  await input.fill("100033");
  await expect(dialog.getByText("Search Results (1)", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/fund\/100033/);
  await page.goBack();
  for (let reopen = 0; reopen < 3; reopen++) {
    await page.getByRole("button", { name: "Open global search", exact: true }).filter({ visible: true }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
  }
});

test("public publication identity and browser security headers are explicit", async ({ request }) => {
  const response = await request.get("/api/freshness");
  expect(response.status()).toBe(200);
  const data = await response.json();
  expect(data.publication.schemaVersion).toBe(1);
  expect(data.publication.sourceAsOf).toBe(data.asOf);
  expect(data.publication.pipelineStatus).toBe("verified");
  expect(data.publication.requiredCoverage.eligible).toBeGreaterThan(0);
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(response.headers()["x-powered-by"]).toBeUndefined();
});

test("new and discontinuous funds do not receive an evidence-free numeric grade", async ({ page }) => {
  for (const code of ["154658", "150523"]) {
    await page.goto(`/fund/${code}`);
    await expect(page.getByText("INSUFFICIENT HISTORY", { exact: false }).first()).toBeVisible();
  }
});
