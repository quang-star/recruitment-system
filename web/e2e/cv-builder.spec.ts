import fs from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { candidateAccount, expectCandidateSignedIn, login, openCandidateSection } from "./helpers";

async function setupStandaloneCandidateApi(page: Page) {
  const drafts = new Map<string, Record<string, unknown>>();
  const cvs: Record<string, unknown>[] = [];
  let draftSeq = 100;
  let cvSeq = 200;

  await page.addInitScript(() => {
    sessionStorage.setItem(
      "smart-recruitment.session",
      JSON.stringify({
        userId: "1001",
        accessToken: "e2e-synthetic-access-token",
        refreshToken: "e2e-synthetic-refresh-token",
        accessTokenExpiresAt: "2099-01-01T00:00:00Z",
        refreshTokenExpiresAt: "2099-01-02T00:00:00Z",
        roles: ["CANDIDATE"],
      }),
    );
  });

  await page.route("**/api/v2/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();

    if (path === "/api/v2/auth/me") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ userId: "1001", status: "ACTIVE", emailVerified: true, roles: ["CANDIDATE"] }),
      });
      return;
    }
    if (path === "/api/v2/candidates/me") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          candidateProfileId: "501",
          userId: "1001",
          displayName: "Nguyễn Minh An",
          headline: "Kỹ sư phần mềm",
          locationText: "TP. Hồ Chí Minh",
          visibility: "APPLICATION_ONLY",
          version: 0,
          phoneNumber: "0901234567",
          contactEmail: "an.nguyen@example.invalid",
          linkedinUrl: null,
          githubUrl: "https://github.com/example-an",
          portfolioUrl: null,
          avatarUrl: null,
          bio: "Phát triển hệ thống Java và TypeScript.",
        }),
      });
      return;
    }
    if (path === "/api/v2/notifications" || path === "/api/v2/candidate/applications") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], total: 0, page: 0, size: 20 }),
      });
      return;
    }
    if (path === "/api/v2/notifications/unread-count") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ unreadCount: 0 }) });
      return;
    }
    if (path === "/api/v2/cvs/drafts" && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(Array.from(drafts.values())),
      });
      return;
    }
    if (path === "/api/v2/cvs/drafts" && method === "POST") {
      const body = req.postDataJSON() as Record<string, unknown>;
      const id = String(++draftSeq);
      const now = new Date().toISOString();
      const created = {
        draftId: id,
        candidateUserId: "1001",
        title: body.title,
        templateId: body.templateId,
        accentColor: body.accentColor,
        sectionOrder: body.sectionOrder,
        payload: body.payload,
        createdAt: now,
        updatedAt: now,
        version: 0,
      };
      drafts.set(id, created);
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(created) });
      return;
    }
    if (path.startsWith("/api/v2/cvs/drafts/") && method === "PUT") {
      const id = path.split("/").pop()!;
      const existing = drafts.get(id);
      if (!existing) {
        await route.fulfill({ status: 404, contentType: "application/json", body: '{"code":"CV_DRAFT_NOT_FOUND","message":"Not found"}' });
        return;
      }
      const body = req.postDataJSON() as Record<string, unknown>;
      const updated = {
        ...existing,
        title: body.title,
        templateId: body.templateId,
        accentColor: body.accentColor,
        sectionOrder: body.sectionOrder,
        payload: body.payload,
        updatedAt: new Date().toISOString(),
        version: Number(existing.version) + 1,
      };
      drafts.set(id, updated);
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(updated) });
      return;
    }
    if (path.startsWith("/api/v2/cvs/drafts/") && method === "DELETE") {
      const id = path.split("/").pop()!;
      drafts.delete(id);
      await route.fulfill({ status: 204, body: "" });
      return;
    }
    if (path === "/api/v2/cvs" && method === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(cvs) });
      return;
    }
    if (path === "/api/v2/cvs" && method === "POST") {
      const id = String(++cvSeq);
      const created = {
        cvId: id,
        candidateUserId: "1001",
        title: "CV Backend Tiếng Việt",
        status: "ACTIVE",
        version: 0,
        activeVersion: {
          cvVersionId: String(cvSeq + 1000),
          versionNumber: 1,
          originalFilename: "CV Backend Tiếng Việt.pdf",
          mimeType: "application/pdf",
          sizeBytes: 12000,
          sha256: "a".repeat(64),
          processingStatus: "UPLOADED",
          failureCode: null,
          version: 0,
        },
      };
      cvs.unshift(created);
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(created) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
}

test("creates Vietnamese multi-template CV, saves server draft, renders real PDF bytes and uploads to library", async ({ page }) => {
  const fontRequests: { url: string; status: number }[] = [];
  page.on("response", (res) => {
    if (res.url().includes("/fonts/noto-sans/")) {
      fontRequests.push({ url: res.url(), status: res.status() });
    }
  });

  if (candidateAccount.email && candidateAccount.password) {
    await login(page, candidateAccount.email, candidateAccount.password);
    await expectCandidateSignedIn(page);
    await openCandidateSection(page, "CV của tôi");
  } else {
    await setupStandaloneCandidateApi(page);
    await page.goto("/candidate/cv");
  }

  await page.getByRole("button", { name: "Tạo CV theo mẫu" }).click();
  await expect(page.getByRole("dialog", { name: "Trình tạo CV theo mẫu" })).toBeVisible();

  await page.getByLabel("Tên bản CV").fill("CV Backend Tiếng Việt");
  await page.getByLabel("Họ và tên").fill("Nguyễn Minh An");
  await page.getByLabel("Vị trí / tiêu đề nghề nghiệp").fill("Kỹ sư phần mềm Backend");
  await page.getByRole("textbox", { name: "Kỹ năng", exact: true }).fill("Java, Spring Boot, PostgreSQL, Tiếng Việt có dấu");

  await page.getByRole("radio", { name: "Executive" }).click();
  await page.getByRole("radio", { name: "Modern" }).click();
  await page.getByRole("button", { name: "Màu Xanh navy" }).click();
  await page.getByRole("button", { name: "Đưa mục Kỹ năng lên" }).click();
  await expect(
    page.getByRole("article", { name: "Bản xem nhanh CV Modern" }).getByLabel("Họ và tên"),
  ).toHaveValue("Nguyễn Minh An");

  await page.getByRole("button", { name: "↶ Hoàn tác" }).click();
  await page.getByRole("button", { name: "↷ Làm lại" }).click();

  await page.getByRole("button", { name: "Lưu bản nháp" }).click();
  await expect(page.getByText(/Đã lưu bản nháp "CV Backend Tiếng Việt"/)).toBeVisible();

  await page.getByRole("button", { name: "Đóng trình tạo CV" }).click();
  await expect(page.getByText("Bản nháp CV tự tạo")).toBeVisible();
  await page.getByRole("button", { name: "Chỉnh sửa tiếp" }).first().click();
  await expect(page.getByLabel("Họ và tên")).toHaveValue("Nguyễn Minh An");

  await page.getByRole("button", { name: "Tạo bản xem trước PDF" }).click();
  const iframe = page.getByTitle("Xem trước PDF Modern");
  await expect(iframe).toBeVisible();
  await expect(iframe).toHaveAttribute("src", /^blob:/);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Tải PDF" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("CV Backend Tiếng Việt.pdf");
  const downloadedPath = await download.path();
  expect(downloadedPath).toBeTruthy();
  const bytes = await fs.readFile(downloadedPath!);
  expect(bytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  expect(bytes.length).toBeGreaterThan(1024);

  expect(fontRequests.length).toBeGreaterThanOrEqual(2);
  expect(fontRequests.every((entry) => entry.status === 200)).toBe(true);

  await page.getByRole("button", { name: "Lưu vào thư viện CV" }).click();
  const uploadDialog = page.getByRole("dialog", { name: "Lưu CV vào thư viện" });
  await uploadDialog.getByLabel("Cho phép dịch vụ AI bên ngoài hỗ trợ phân tích nội dung này").check();
  await uploadDialog.getByRole("button", { name: "Xác nhận lưu vào thư viện CV" }).click();
  await expect(page.getByText(/Đã lưu CV PDF vào thư viện CV/)).toBeVisible();

  await page.getByRole("button", { name: "Đóng trình tạo CV" }).click();
  await expect(page.locator(".cv-item", { hasText: "CV Backend Tiếng Việt" }).first()).toBeVisible();

  await page.getByRole("button", { name: "Sửa file PDF trực tiếp" }).click();
  await expect(page.getByRole("dialog", { name: "Sửa nhanh trực tiếp trên PDF gốc" })).toBeVisible();
  await page.locator('input[aria-label="Chọn file PDF để sửa trực tiếp"]').setInputFiles(downloadedPath!);
  const pdfCanvas = page.getByLabel("Trang PDF 1");
  await expect(pdfCanvas).toBeVisible();
  await page.getByRole("button", { name: "+ Chèn chữ" }).click();
  await pdfCanvas.click({ position: { x: 120, y: 120 } });
  await page.getByLabel("Nội dung chữ").fill("Cập nhật tiếng Việt trực tiếp");

  const overlayDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Tải PDF đã sửa" }).click();
  const overlayDownload = await overlayDownloadPromise;
  const overlayPath = await overlayDownload.path();
  expect(overlayPath).toBeTruthy();
  const editedBytes = await fs.readFile(overlayPath!);
  expect(editedBytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  expect(editedBytes.length).toBeGreaterThan(1024);
});
