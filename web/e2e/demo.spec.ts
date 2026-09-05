import { expect, Page, test } from "@playwright/test";

const candidate = {
  email: process.env.E2E_CANDIDATE_EMAIL ?? "candidate.demo@smart.local",
  password: process.env.E2E_CANDIDATE_PASSWORD ?? "DemoCandidate!2026"
};

const recruiter = {
  email: process.env.E2E_RECRUITER_EMAIL ?? "recruiter.demo@smart.local",
  password: process.env.E2E_RECRUITER_PASSWORD ?? "DemoRecruiter!2026"
};

async function login(page: Page, email: string, password: string) {
  await page.goto("/");
  const form = page.locator("form");
  await form.getByLabel("Email").fill(email);
  await form.getByLabel("Mật khẩu").fill(password);
  await form.getByRole("button", { name: "Đăng nhập", exact: true }).click();
}

test("candidate can open the complete demo workspace", async ({ page }) => {
  await login(page, candidate.email, candidate.password);

  await expect(page.getByRole("heading", { name: "Tổng quan nhanh" })).toBeVisible();
  await expect(page.getByText("Thông báo chưa đọc", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Hồ sơ", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Hồ sơ ứng viên" })).toBeVisible();
  await page.getByRole("button", { name: "Thông báo", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Thông báo", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Bảo mật", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Mật khẩu & phiên đăng nhập" })).toBeVisible();
  await page.getByRole("button", { name: "CV của tôi", exact: true }).click();
  await expect(page.getByRole("heading", { name: "CV của bạn" })).toBeVisible();
  await page.getByRole("button", { name: "Việc làm & ứng tuyển", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Job đang tuyển" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Đăng xuất", exact: true })).toBeEnabled();
});

test("recruiter can open company, access control, JD and pipeline features", async ({ page }) => {
  await login(page, recruiter.email, recruiter.password);

  await expect(page.getByRole("heading", { name: "Tổng quan nhanh" })).toBeVisible();
  await expect(page.getByText("Tin tuyển dụng", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Công ty & thành viên", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Công ty của tôi" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Thành viên công ty" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Mời thành viên" })).toBeVisible();
  await page.getByRole("button", { name: "Tin & ứng viên", exact: true }).click();
  await expect(page.getByRole("heading", { name: "JD của công ty" })).toBeVisible();
  await page.locator(".job-list .company-option").first().click();
  await expect(page.getByRole("heading", { name: "Ứng viên" })).toBeVisible();
  await page.getByRole("button", { name: "Bảo mật", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Mật khẩu & phiên đăng nhập" })).toBeVisible();
});

test("forgot-password remains public and account-enumeration safe", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Quên mật khẩu?" }).click();
  await expect(page.getByRole("heading", { name: "Quên mật khẩu" })).toBeVisible();

  await page.getByLabel("Email").fill("missing.e2e@smart.local");
  const responsePromise = page.waitForResponse((response) =>
    response.request().method() === "POST" && response.url().includes("/api/v1/auth/forgot-password"));
  await page.locator("form").getByRole("button", { name: "Gửi hướng dẫn" }).click();

  const response = await responsePromise;
  expect(response.status()).toBe(202);
  await expect(page.getByRole("status")).toContainText(
    "Nếu tài khoản hợp lệ, hướng dẫn đặt lại mật khẩu đã được gửi qua email."
  );
});
