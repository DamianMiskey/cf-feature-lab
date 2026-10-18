import { expect, test } from "@playwright/test";

// Features driven through the UI. These write (KV keys, D1 notes, counters),
// so they only run against the local E2E build, never the live site.

test("KV: put a key, then read it back", async ({ page }) => {
  const key = `e2e-${Date.now()}`;
  await page.goto("/kv");
  await page.getByLabel("Key", { exact: true }).fill(key);
  await page.getByLabel("Value").fill("hello from Playwright");
  await page.getByRole("button", { name: "Put" }).click();
  await expect(page.getByText(key).first()).toBeVisible();
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByText(key).first()).toBeVisible();
});

test("D1: Turnstile passes and the note is inserted", async ({ page }) => {
  const body = `Written by Playwright ${Date.now()}`;
  await page.goto("/d1");
  await page.getByLabel("Author").fill("Playwright");
  await page.getByLabel("Note").fill(body);
  // Cloudflare's always-pass test key: the real widget runs and issues a token,
  // and the Worker checks it with siteverify.
  const insert = page.getByRole("button", { name: "Insert" });
  await expect(insert).toBeEnabled({ timeout: 20_000 });
  await insert.click();
  await expect(page.getByText(body)).toBeVisible();
});

test("Durable Objects: a named counter counts", async ({ page }) => {
  await page.goto("/durable-objects");
  await page.getByLabel("Object name").fill(`e2e-${Date.now()}`);
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "+1" }).click();
  await expect(page.locator(".big-number").first()).toHaveText("3");
});

test("Durable Objects: the race test shows KV losing updates and the DO keeping them", async ({ page }) => {
  await page.goto("/durable-objects");
  await page.getByRole("button", { name: "Run race" }).click();
  await expect(page.getByRole("button", { name: "Run race" })).toBeEnabled({ timeout: 30_000 });
});

test("Durable Objects: two visitors chat over WebSockets", async ({ browser }) => {
  const room = `e2e-${Date.now()}`;
  const [a, b] = await Promise.all([browser.newPage(), browser.newPage()]);
  for (const [page, name] of [[a, "Ada"], [b, "Grace"]] as const) {
    await page.goto("/durable-objects");
    await page.getByLabel("Room").fill(room);
    await page.getByLabel("Your name").fill(name);
    await page.getByRole("button", { name: "Join room" }).click();
  }
  await a.getByLabel("Message", { exact: true }).fill("Hello Grace");
  await a.getByLabel("Message", { exact: true }).press("Enter");
  await expect(b.getByText("Hello Grace")).toBeVisible();
});

test("Cache API: a miss, then a hit", async ({ page }) => {
  await page.goto("/cache");
  await page.getByLabel("Item (part of the cache key)").fill(`e2e-${Date.now()}`);
  await page.getByRole("button", { name: "Fetch" }).click();
  await expect(page.getByText("MISS").first()).toBeVisible();
  await page.getByRole("button", { name: "Fetch" }).click();
  await expect(page.getByText("HIT").first()).toBeVisible();
});

test("Rate Limiting: a burst gets 429s", async ({ page }) => {
  await page.goto("/rate-limiting");
  await page.getByRole("button", { name: /Send 20 requests/ }).click();
  await expect(page.getByText(/429/).first()).toBeVisible({ timeout: 20_000 });
});
