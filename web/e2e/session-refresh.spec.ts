import { expect, Page, test } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/?auth=login");
  const form = page.locator("form");
  await form.getByLabel("Email").fill("candidate.demo@smart.local");
  await form.getByLabel("Mật khẩu").fill("DemoCandidate!2026");
  await form.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.getByRole("heading", { name: /^Xin chào,/, level: 1 })).toBeVisible();
}

test("stored invalid access token rotates through real Auth and recovers the workspace", async ({ page }) => {
  await login(page);
  await page.evaluate(() => {
    const key = "smart-recruitment.session";
    const value = JSON.parse(sessionStorage.getItem(key)!);
    value.accessToken = "synthetic-invalid-access-token";
    sessionStorage.setItem(key, JSON.stringify(value));
  });
  let refreshes = 0;
  page.on("request", (request) => { if (new URL(request.url()).pathname === "/api/v2/auth/refresh") refreshes++; });
  await page.reload();
  await expect(page.getByRole("heading", { name: /^Xin chào,/, level: 1 })).toBeVisible();
  expect(refreshes).toBe(1);
  await page.getByRole("button", { name: "CV của tôi", exact: true }).click();
  await expect(page.getByRole("button", { name: "Tải CV lên", exact: true })).toBeVisible();
});

test("concurrent unauthorized reads use one real refresh while an unsaved profile stays intact", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "Hồ sơ", exact: true }).click();
  const draft = page.getByLabel("Tên hiển thị", { exact: true });
  await draft.fill("Unsaved refresh draft");
  const paths = new Set(["/api/v2/cvs", "/api/v2/candidate/applications"]);
  const denied = new Set<string>();
  let refreshes = 0;
  page.on("request", (request) => { if (new URL(request.url()).pathname === "/api/v2/auth/refresh") refreshes++; });
  // Hold Auth briefly so both independently rejected reads join the same refresh.
  await page.route("**/api/v2/auth/refresh", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.continue();
  });
  await page.route("**/api/v2/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (paths.has(path) && !denied.has(path)) {
      denied.add(path);
      await route.fulfill({ status: 401, contentType: "application/json", body: '{"code":"HTTP_ERROR","message":"Expired"}' });
    } else await route.fallback();
  });
  // The dashboard loads both independently protected resources in parallel.
  await page.getByRole("button", { name: "Tổng quan", exact: true }).click();
  await expect(page.getByRole("heading", { name: /^Xin chào,/, level: 1 })).toBeVisible();
  await expect.poll(() => denied.size).toBe(2);
  await expect.poll(() => refreshes).toBe(1);
  await expect(page.getByRole("button", { name: /^CV sẵn sàng / })).toBeVisible();
  await page.getByRole("button", { name: "Hồ sơ", exact: true }).click();
  await expect(draft).toHaveValue("Unsaved refresh draft");
  expect(refreshes).toBe(1);
});

test("initial verification outage retains the stored session and blocks private content until retry", async ({ page }) => {
  await login(page);
  let unavailable = true;
  await page.route("**/api/v2/auth/me", async (route) => {
    if (unavailable) await route.fulfill({ status: 503, contentType: "application/json", body: '{"code":"UNAVAILABLE","message":"Try later"}' });
    else await route.continue();
  });
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("Phiên được giữ lại");
  await expect(page.getByRole("button", { name: "CV của tôi", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem("smart-recruitment.session") !== null)).toBe(true);
  unavailable = false;
  await page.getByRole("button", { name: "Thử xác minh lại" }).click();
  await expect(page.getByRole("heading", { name: /^Xin chào,/, level: 1 })).toBeVisible();
});
