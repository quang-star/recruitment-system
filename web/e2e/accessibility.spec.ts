import { expect, test } from "@playwright/test";

test("public login modal traps keyboard focus and the unverified salary tool stays hidden", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Tính lương Gross–Net" })).toHaveCount(0);
  const trigger = page.locator(".portal-navbar-root").getByRole("button", { name: "Đăng nhập", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeFocused();
  await dialog.getByLabel("Email", { exact: true }).fill("synthetic.keyboard@smart.local");
  const lastControl = dialog.getByRole("button", { name: "Gửi lại email xác minh" });
  const close = dialog.getByRole("button", { name: "Đóng đăng nhập" });
  await lastControl.focus();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(lastControl).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("mobile job review stays within the viewport and returns to results", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Tìm việc làm", exact: true }).click();
  const firstJob = page.locator(".split-job-card").first();
  await expect(firstJob).toBeVisible();
  await firstJob.click();
  const detail = page.getByRole("complementary", { name: "Chi tiết việc làm đã chọn" });
  await expect(detail).toBeVisible();
  await expect(detail).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "test-results/mobile-job-review.png" });
  await page.keyboard.press("Escape");
  await expect(detail).not.toBeVisible();
  await expect(firstJob).toBeFocused();
  await firstJob.click();
  await detail.getByRole("button", { name: "Ứng tuyển ngay" }).click();
  await expect(page.getByText(/Bạn đang ứng tuyển:/)).toBeVisible();
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
});
