import { expect, Page } from "@playwright/test";

export const candidateAccount = {
  email: process.env.E2E_CANDIDATE_EMAIL ?? "",
  password: process.env.E2E_CANDIDATE_PASSWORD ?? ""
};

export const recruiterAccount = {
  email: process.env.E2E_RECRUITER_EMAIL ?? "",
  password: process.env.E2E_RECRUITER_PASSWORD ?? ""
};

export const adminAccount = {
  email: process.env.E2E_ADMIN_EMAIL ?? "",
  password: process.env.E2E_ADMIN_PASSWORD ?? ""
};

export async function login(page: Page, email: string, password: string) {
  if (!email || !password) throw new Error("Provide explicit synthetic E2E account credentials for the isolated QA stack");
  await page.goto("/?auth=login");
  const form = page.locator("form");
  await form.getByLabel("Email").fill(email);
  await form.getByLabel("Mật khẩu").fill(password);
  await form.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(sessionStorage.getItem("smart-recruitment.session")))).toBe(true);
}

export async function expectCandidateSignedIn(page: Page) {
  await expect(page.getByRole("button", { name: /^Tài khoản / })).toBeVisible();
}

export async function openCandidateMenu(page: Page) {
  const trigger = page.getByRole("button", { name: /^Tài khoản / });
  await expect(trigger).toBeVisible();
  if (await trigger.getAttribute("aria-expanded") !== "true") {
    await trigger.focus();
    await trigger.press("Enter");
  }
  const menu = page.getByRole("navigation", { name: "Tài khoản cá nhân" });
  await expect(menu).toBeVisible();
  return menu;
}

export async function openCandidateSection(page: Page, name: "Tổng quan" | "Hồ sơ" | "CV của tôi" | "Việc làm đã ứng tuyển" | "Bảo mật") {
  const menu = await openCandidateMenu(page);
  await menu.getByRole("button", { name, exact: true }).click();
}
