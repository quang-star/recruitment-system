import { expect, Page, test } from "@playwright/test";
import path from "node:path";
import { readFileSync } from "node:fs";

const candidate = {
  email: process.env.E2E_CANDIDATE_EMAIL ?? "candidate.demo@smart.local",
  password: process.env.E2E_CANDIDATE_PASSWORD ?? "DemoCandidate!2026"
};

const recruiter = {
  email: process.env.E2E_RECRUITER_EMAIL ?? "recruiter.demo@smart.local",
  password: process.env.E2E_RECRUITER_PASSWORD ?? "DemoRecruiter!2026"
};

async function login(page: Page, email: string, password: string) {
  await page.goto("/?auth=login");
  const form = page.locator("form");
  await form.getByLabel("Email").fill(email);
  await form.getByLabel("Mật khẩu").fill(password);
  await form.getByRole("button", { name: "Đăng nhập", exact: true }).click();
}

test("candidate can open the complete demo workspace", async ({ page }) => {
  await login(page, candidate.email, candidate.password);

  await expect(page.getByRole("heading", { name: /^Xin chào,/, level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: /^CV sẵn sàng / })).toBeVisible();
  await page.getByRole("button", { name: "Hồ sơ", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Hồ sơ ứng viên" })).toBeVisible();
  await page.getByRole("button", { name: "Thông báo", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Thông báo", exact: true, level: 3 })).toBeVisible();
  await page.getByRole("button", { name: "Bảo mật", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Mật khẩu & phiên đăng nhập" })).toBeVisible();
  await page.getByRole("button", { name: "CV của tôi", exact: true }).click();
  await expect(page.getByRole("heading", { name: "CV của tôi", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Tìm việc", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tìm việc làm" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Đăng xuất$/ })).toBeEnabled();
});

test("candidate explicitly controls external AI consent per uploaded CV", async ({ page }) => {
  await login(page, candidate.email, candidate.password);
  await page.getByRole("button", { name: "CV của tôi", exact: true }).click();
  const choice = page.getByRole("checkbox", { name: "Cho phép dịch vụ AI bên ngoài hỗ trợ phân tích nội dung này" });
  for (const consented of [false, true]) {
    const title = `E2E external AI ${consented} ${Date.now()}`;
    await expect(choice).not.toBeChecked();
    await page.getByLabel("Tên CV (tuỳ chọn)").fill(title);
    await page.getByLabel("File PDF (tối đa 10 MiB)").setInputFiles(path.resolve("e2e/fixtures/job-scoped-skills-cv.pdf"));
    if (consented) await choice.check();
    const responsePromise = page.waitForResponse((response) => response.request().method() === "POST"
      && new URL(response.url()).pathname === "/api/v2/cvs");
    await page.getByRole("button", { name: "Tải CV lên", exact: true }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(201);
    const created = await response.json();
    expect(created.activeVersion.externalAiConsent).toBe(consented);
    expect(created.activeVersion.externalAiPolicyVersion).toBe(consented ? "external-ai/1.0" : null);
    await expect(choice).not.toBeChecked();
    const card = page.locator(".cv-item").filter({ hasText: title });
    await expect(card.getByRole("button", { name: "Xem bản phân tích" })).toBeVisible({ timeout: 30_000 });
    if (consented) {
      await card.getByRole("button", { name: "Xem bản phân tích" }).click();
      // QA has external providers disabled; consent still persists and local parsing remains usable.
      await expect(page.getByText("Phân tích tự động chưa đầy đủ, vui lòng kiểm tra và bổ sung.")).toBeVisible();
      await expect(page.getByText(/EXTERNAL_AI_NOT_CONFIGURED/)).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Xác nhận bản phân tích" })).toBeEnabled();
      await page.screenshot({ path: "test-results/external-ai-consent.png", fullPage: true });
    }
  }
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
  await expect(page.getByRole("heading", { name: "Ứng viên", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Bảo mật", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Mật khẩu & phiên đăng nhập" })).toBeVisible();
});

test("recruiter explicitly controls external AI consent per JD version", async ({ page }) => {
  await login(page, recruiter.email, recruiter.password);
  await page.getByRole("button", { name: "Tin & ứng viên", exact: true }).click();
  for (const consented of [false, true]) {
    await page.getByRole("button", { name: "+ Tạo JD mới", exact: true }).click();
    const choice = page.getByRole("checkbox", { name: "Cho phép dịch vụ AI bên ngoài hỗ trợ phân tích nội dung này" });
    await expect(choice).not.toBeChecked();
    await page.getByLabel("Tiêu đề", { exact: true }).fill(`E2E JD external AI ${consented} ${Date.now()}`);
    await page.getByLabel("Mô tả công việc", { exact: true }).fill("Build Java backend services with automated tests.");
    await page.getByLabel("Yêu cầu", { exact: true }).fill("Required: Java and SQL. At least 1 year experience.");
    if (consented) await choice.check();
    const responsePromise = page.waitForResponse((response) => response.request().method() === "POST"
      && /^\/api\/v1\/companies\/[^/]+\/jobs$/.test(new URL(response.url()).pathname));
    await page.getByRole("button", { name: "Tạo bản nháp", exact: true }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    const created = await response.json();
    expect(created.externalAiConsent).toBe(consented);
    expect(created.externalAiPolicyVersion).toBe(consented ? "external-ai/1.0" : null);
    await page.getByRole("button", { name: "Kiểm tra yêu cầu", exact: true }).click();
    await expect(page.getByRole("button", { name: "Xác nhận yêu cầu tuyển dụng", exact: true })).toBeVisible({ timeout: 30_000 });
    if (consented) {
      await expect(page.getByText("Phân tích tự động chưa đầy đủ, vui lòng kiểm tra và bổ sung.")).toBeVisible();
      await expect(page.getByText(/EXTERNAL_AI_NOT_CONFIGURED/)).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Xác nhận yêu cầu tuyển dụng", exact: true })).toBeEnabled();
      await page.screenshot({ path: "test-results/external-ai-jd-consent.png", fullPage: true });
    }
  }
});

test("forgot-password remains public and account-enumeration safe", async ({ page }) => {
  await page.goto("/?auth=login");
  await page.getByRole("button", { name: "Quên mật khẩu?" }).click();
  await expect(page.getByRole("heading", { name: "Quên mật khẩu" })).toBeVisible();

  await page.getByLabel("Email").fill("missing.e2e@smart.local");
  const responsePromise = page.waitForResponse((response) =>
    response.request().method() === "POST" && response.url().includes("/api/v2/auth/forgot-password"));
  await page.locator("form").getByRole("button", { name: "Gửi hướng dẫn" }).click();

  const response = await responsePromise;
  expect(response.status()).toBe(202);
  await expect(page.getByRole("status")).toContainText(
    "Nếu tài khoản hợp lệ, hướng dẫn đặt lại mật khẩu đã được gửi qua email."
  );
});

test("corrupted PDF reaches failed status with an actionable recovery instruction", async ({ page }) => {
  const unique = `E2E corrupted PDF ${Date.now()}`;
  await login(page, candidate.email, candidate.password);
  await page.getByRole("button", { name: "CV của tôi", exact: true }).click();
  await page.getByLabel("Tên CV (tuỳ chọn)").fill(unique);
  await page.locator("#cv-file").setInputFiles({
    name: "synthetic-corrupted.pdf", mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7\nsynthetic corrupted document without cross-reference table\n%%EOF"),
  });
  await page.getByRole("button", { name: "Tải CV lên", exact: true }).click();
  const cv = page.locator(".cv-item").filter({ has: page.getByRole("heading", { name: unique, exact: true }) });
  await expect(cv.getByText("Phân tích chưa thành công", { exact: true })).toBeVisible({ timeout: 45_000 });
  await expect(cv.getByText(/Không đọc được nội dung PDF/)).toBeVisible();
  await expect(cv.getByRole("button", { name: "Xem bản phân tích" })).toHaveCount(0);
  await expect(cv.getByRole("button", { name: "Thử lại", exact: true })).toHaveCount(0);
  await page.screenshot({ path: "test-results/worker-retry-corrupted-pdf.png", fullPage: true });
});

test("candidate retries a transient failed CV using the same stored file", async ({ page, request }) => {
  const cvId = process.env.E2E_RETRY_CV_ID;
  const title = process.env.E2E_RETRY_CV_TITLE;
  test.skip(!cvId || !title, "Requires an insert-only synthetic storage-failure fixture in the QA stack");
  await login(page, candidate.email, candidate.password);
  await page.getByRole("button", { name: "CV của tôi", exact: true }).click();
  const cv = page.locator(".cv-item").filter({ has: page.getByRole("heading", { name: title!, exact: true }) });
  await expect(cv.getByRole("button", { name: "Thử lại", exact: true })).toBeVisible();
  expect((await request.post(`/api/v2/cvs/${cvId}/retry`, {
    data: { cvVersionId: process.env.E2E_RETRY_CV_VERSION_ID, expectedVersion: 1 },
  })).status()).toBe(401);
  let release: () => void = () => {};
  const allowRequest = new Promise<void>((resolve) => { release = resolve; });
  let count = 0;
  await page.route(`**/api/v2/cvs/${cvId}/retry`, async (route) => {
    count++;
    await allowRequest;
    await route.continue();
  });
  const responsePromise = page.waitForResponse((response) => response.url().endsWith(`/api/v2/cvs/${cvId}/retry`));
  await cv.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(cv.getByRole("button", { name: "Đang gửi yêu cầu…", exact: true })).toBeDisabled();
  release();
  const response = await responsePromise;
  expect(response.status()).toBe(202);
  const queued = await response.json();
  expect(queued.cvId).toBe(cvId);
  expect(queued.activeVersion.cvVersionId).toBe(process.env.E2E_RETRY_CV_VERSION_ID);
  expect(queued.activeVersion.processingStatus).toBe("QUEUED");
  expect(queued.activeVersion.sha256).toBe(process.env.E2E_RETRY_CV_SOURCE_HASH);
  await expect(cv.getByRole("button", { name: "Xem bản phân tích", exact: true })).toBeVisible({ timeout: 45_000 });
  await expect(cv.getByText("Cần kiểm tra", { exact: true })).toBeVisible();
  await expect(cv.getByRole("button", { name: "Thử lại", exact: true })).toHaveCount(0);
  await cv.getByRole("button", { name: "Xem bản phân tích", exact: true }).click();
  await expect(page.getByRole("button", { name: "Xác nhận bản phân tích", exact: true })).toBeEnabled();
  expect(count).toBe(1);
  await page.screenshot({ path: "test-results/cv-retry-recovered.png", fullPage: true });
});


test("complete recruitment workflow through UI with editable CV and evidence", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const unique = `E2E Backend ${Date.now()}`;
  await login(page, recruiter.email, recruiter.password);
  await page.getByRole("button", { name: "Tin & ứng viên", exact: true }).click();
  await page.getByRole("button", { name: "+ Tạo JD mới", exact: true }).click();
  await page.getByLabel("Tiêu đề", { exact: true }).fill(unique);
  await page.getByLabel("Mô tả công việc", { exact: true }).fill("Build and maintain Java backend services. Develop Kafka integrations and automated tests for reliable systems.");
  await page.getByLabel("Yêu cầu", { exact: true }).fill("Required: Java, Kafka, NewFrameworkX. English B2. Bachelor degree. At least 1 year experience.");
  await page.getByRole("button", { name: "Tạo bản nháp", exact: true }).click();
  // The QA stack uses local rules; provider extraction is tested with grounded mocks.
  // Review can add the same Job-only proposal without a real provider credential.
  await page.getByRole("button", { name: "Kiểm tra yêu cầu", exact: true }).click();
  await expect(page.getByRole("button", { name: "Xác nhận yêu cầu tuyển dụng", exact: true })).toBeVisible({ timeout: 45_000 });
  await page.locator(".parsed-section").filter({ has: page.getByText("Kỹ năng bắt buộc (Critical)", { exact: true }) })
    .getByRole("button", { name: "+ Thêm kỹ năng", exact: true }).click();
  await page.getByLabel("Kỹ năng bắt buộc 3", { exact: true }).fill("NewFrameworkX");
  await page.getByRole("button", { name: "Lưu thay đổi yêu cầu", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Đã lưu ParsedJD revision mới.");
  await expect(page.getByText("Kỹ năng mới · cần xác nhận cùng JD", { exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/job-skills-jd-review.png", fullPage: true });
  await page.getByRole("button", { name: "Xác nhận yêu cầu tuyển dụng", exact: true }).click({ timeout: 45_000 });
  await expect(page.getByText("Dùng cho Job này · đối chiếu tên chính xác", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "✏️ Chi tiết tin tuyển dụng", exact: true }).click();
  await expect(async () => {
    await page.getByRole("button", { name: "Đăng JD", exact: true }).click();
    await expect(page.getByRole("button", { name: "Đóng JD", exact: true })).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });

  const candidateContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
  const candidatePage = await candidateContext.newPage();
  try {
    await login(candidatePage, candidate.email, candidate.password);
    await candidatePage.getByRole("button", { name: "CV của tôi", exact: true }).click();
    await candidatePage.getByLabel("Tên CV (tuỳ chọn)").fill(unique);
    // Regression: real exporters can prepend a newline before the PDF header.
    await candidatePage.locator("#cv-file").setInputFiles({
      name: "leading-newline-cv.pdf", mimeType: "application/pdf",
      buffer: Buffer.concat([Buffer.from("\n"), readFileSync(path.resolve("e2e/fixtures/job-scoped-skills-cv.pdf"))])
    });
    await candidatePage.getByRole("button", { name: "Tải CV lên", exact: true }).click();
    const cv = candidatePage.locator(".cv-item").filter({ has: candidatePage.getByRole("heading", { name: unique, exact: true }) });
    await cv.getByRole("button", { name: "Xem bản phân tích" }).click({ timeout: 45_000 });
    await candidatePage.screenshot({ path: "test-results/job-skills-cv-review.png", fullPage: true });
    await candidatePage.getByLabel("Bắt đầu công việc 1").fill("2022-01");
    await candidatePage.getByLabel("Đang làm việc 1").check();
    await candidatePage.getByRole("button", { name: "Thêm ngoại ngữ" }).click();
    await candidatePage.getByLabel("Trình độ 1").fill("B2");
    await candidatePage.getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
    const cvFeedback = candidatePage.locator(".success-message[role='status']");
    await expect(cvFeedback).toContainText("Đã lưu thay đổi.");
    await candidatePage.getByRole("button", { name: "Xác nhận bản phân tích", exact: true }).click();
    await expect(cvFeedback).toContainText("CV đã được xác nhận và sẵn sàng ứng tuyển.");
    // Core receives confirmation asynchronously; revisit the panel until it projects the CV.
    await expect(async () => {
      await candidatePage.getByRole("button", { name: "CV của tôi", exact: true }).click();
      await candidatePage.getByRole("button", { name: "Tìm việc", exact: true }).click();
      await candidatePage.getByLabel("Tìm kiếm", { exact: true }).fill(unique);
      await candidatePage.locator(".job-card").filter({ hasText: unique }).click();
      await candidatePage.getByRole("button", { name: "Ứng tuyển vị trí này" }).click();
      const available = await candidatePage.getByRole("dialog").getByLabel("CV đã xác nhận").locator("option").allTextContents();
      if (!available.includes(unique)) {
        await candidatePage.getByRole("dialog").getByRole("button", { name: "Đóng", exact: true }).click();
      }
      expect(available).toContain(unique);
    }).toPass({ timeout: 30_000 });
    const dialog = candidatePage.getByRole("dialog");
    await dialog.getByLabel("CV đã xác nhận").selectOption({ label: unique });
    await dialog.getByRole("checkbox").check();
    const applicationResponse = candidatePage.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith("/api/v2/candidate/applications"));
    await dialog.getByRole("button", { name: "Ứng tuyển", exact: true }).click();
    expect((await applicationResponse).ok()).toBeTruthy();

    await page.getByRole("button", { name: /Ứng viên & Pipeline/ }).click();
    await expect(async () => {
      await page.getByRole("button", { name: "Làm mới", exact: true }).click();
      await expect(page.locator(".application-detail .match-summary")).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 45_000 });
    await expect(page.locator(".match-claims li").filter({ hasText: "NewFrameworkX" })).toContainText("Đáp ứng:");
    await expect(page.locator(".match-claims li").filter({ hasText: "NewFrameworkX" })).toContainText("kỹ năng riêng của Job, đối chiếu tên chính xác");
    await page.screenshot({ path: "test-results/job-skills-matching.png", fullPage: true });
    const sourceResponse = page.waitForResponse((response) =>
      response.request().method() === "GET" && /\/api\/v1\/recruiter\/applications\/[^/]+\/cv$/.test(new URL(response.url()).pathname));
    const sourceWindow = page.waitForEvent("popup");
    await page.getByRole("button", { name: "Xem CV trang 1" }).first().click();
    expect((await sourceResponse).ok()).toBeTruthy();
    const sourcePage = await sourceWindow;
    await expect(sourcePage).toHaveURL(/blob:.*#page=1$/);
    await sourcePage.close();
    await page.getByRole("button", { name: "Bắt đầu xem xét", exact: true }).click();
    await page.getByRole("button", { name: "Đưa vào shortlist", exact: true }).click();
    await expect(page.locator(".application-item")).toContainText("Danh sách rút gọn");
    await candidatePage.reload();
    await candidatePage.getByRole("button", { name: "Đã ứng tuyển", exact: true }).click();
    await expect(candidatePage.locator(".application-detail").filter({ hasText: unique })).toContainText("Danh sách rút gọn");
  } finally {
    await candidateContext.close();
  }
});
