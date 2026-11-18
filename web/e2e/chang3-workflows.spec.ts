import { expect, Page, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { candidateAccount, login, recruiterAccount } from "./helpers";

const mailpitBase = (process.env.MAILPIT_URL ?? "http://localhost:8025").replace(/\/+$/, "");

async function authHeaders(page: Page) {
  const token = await page.evaluate(
    () => JSON.parse(sessionStorage.getItem("smart-recruitment.session")!).accessToken as string
  );
  return { Authorization: `Bearer ${token}`, "Idempotency-Key": crypto.randomUUID() };
}

async function apiJson(page: Page, url: string, method = "GET", data?: unknown, expectedStatus = 200) {
  const response = await page.request.fetch(url, { method, data, headers: await authHeaders(page) });
  expect(response.status(), `${method} ${url}`).toBe(expectedStatus);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function registerAndVerifyViaMailpit(
  page: Page,
  email: string,
  password: string,
  accountType: "CANDIDATE" | "RECRUITER"
) {
  const registerRes = await page.request.post("/api/v2/auth/register", {
    data: { email, password, accountType }
  });
  expect(registerRes.status()).toBe(201);

  let verificationToken: string | null = null;
  await expect
    .poll(
      async () => {
        const listRes = await page.request.get(`${mailpitBase}/api/v1/messages`);
        if (!listRes.ok()) return null;
        const listBody = (await listRes.json()) as {
          messages?: Array<{ ID: string; To?: Array<{ Address?: string }>; Snippet?: string }>;
        };
        for (const msg of listBody.messages ?? []) {
          const toMatch = (msg.To ?? []).some((r) => (r.Address ?? "").toLowerCase() === email.toLowerCase());
          if (!toMatch) continue;
          const matchSnippet = (msg.Snippet ?? "").match(/token=([0-9a-f]{64})/);
          if (matchSnippet) {
            verificationToken = matchSnippet[1];
            return verificationToken;
          }
          const detailRes = await page.request.get(`${mailpitBase}/api/v1/message/${msg.ID}`);
          if (detailRes.ok()) {
            const detail = (await detailRes.json()) as { Text?: string; HTML?: string };
            const body = `${detail.Text ?? ""}\n${detail.HTML ?? ""}`;
            const m = body.match(/token=([0-9a-f]{64})/);
            if (m) {
              verificationToken = m[1];
              return verificationToken;
            }
          }
        }
        return null;
      },
      { timeout: 30_000 }
    )
    .toBeTruthy();

  const verifyRes = await page.request.post("/api/v2/auth/verify-email", {
    data: { token: verificationToken }
  });
  expect([200, 204]).toContain(verifyRes.status());
}

async function uploadAndConfirmCv(page: Page, title: string, fixtureFile: string) {
  const uploadRes = await page.request.post("/api/v2/cvs", {
    headers: await authHeaders(page),
    multipart: {
      title,
      file: {
        name: fixtureFile,
        mimeType: "application/pdf",
        buffer: readFileSync(path.resolve("e2e/fixtures", fixtureFile))
      }
    }
  });
  expect(uploadRes.status()).toBe(201);
  const cv = (await uploadRes.json()) as { cvId: string; activeVersion: { cvVersionId: string } };
  const versionId = cv.activeVersion.cvVersionId;

  await expect
    .poll(
      async () => (await page.request.get(`/api/v2/parsed-cvs/${versionId}`, { headers: await authHeaders(page) })).status(),
      { timeout: 45_000 }
    )
    .toBe(200);

  const parsed = await apiJson(page, `/api/v2/parsed-cvs/${versionId}`);
  await apiJson(page, `/api/v2/parsed-cvs/${versionId}/confirm`, "POST", {
    expectedRevisionId: parsed.revisionId
  });

  await expect
    .poll(
      async () => {
        const list = (await apiJson(page, "/api/v2/cvs")) as Array<{
          cvId: string;
          activeVersion: { processingStatus: string };
        }>;
        return list.find((c) => c.cvId === cv.cvId)?.activeVersion.processingStatus;
      },
      { timeout: 30_000 }
    )
    .toBe("CONFIRMED");

  return { cvId: cv.cvId, versionId };
}

test("Chặng 3 - HR đăng ký qua Mailpit, auto-slug công ty PENDING, và khóa định danh công ty ACTIVE", async ({
  browser
}) => {
  test.setTimeout(120_000);
  const ts = Date.now();
  const hrEmail = `e2e.hr.${ts}@smart.local`;
  const hrPassword = "HrPassword!2026";
  const hrPage = await browser.newPage();

  try {
    await registerAndVerifyViaMailpit(hrPage, hrEmail, hrPassword, "RECRUITER");
    await login(hrPage, hrEmail, hrPassword);

    await hrPage.getByRole("button", { name: "Công ty & thành viên", exact: true }).click();
    await hrPage.getByRole("button", { name: "+ Tạo công ty mới" }).click();

    await hrPage.getByLabel("Tên pháp lý", { exact: true }).fill(`Công ty TNHH Chặng Ba ${ts}`);
    await hrPage.getByLabel("Tên hiển thị", { exact: true }).fill(`Chặng Ba Tech ${ts}`);
    await expect(hrPage.getByLabel("Slug", { exact: true })).toHaveValue(`chang-ba-tech-${ts}`);
    await hrPage.getByLabel("Quốc gia", { exact: true }).fill("VN");
    await hrPage.getByLabel("Mã đăng ký", { exact: true }).fill(`MST-${ts}`);
    await hrPage.getByRole("button", { name: "Ảnh văn phòng công nghệ" }).click();
    await hrPage.getByRole("button", { name: "Logo mẫu" }).click();
    await hrPage.getByRole("button", { name: "Tạo công ty", exact: true }).click();

    await expect(hrPage.getByText("Thông tin công ty đã được cập nhật.").or(hrPage.getByText("Công ty đã được tạo."))).toBeVisible();
    await hrPage.getByRole("button", { name: "Tin & ứng viên", exact: true }).click();
    await expect(hrPage.getByText(/Công ty đang chờ Admin duyệt/)).toBeVisible();
  } finally {
    await hrPage.close();
  }

  // Verify ACTIVE company locks legalName / countryCode / registrationNumber on UI & Core API
  const activeHrPage = await browser.newPage();
  try {
    await login(activeHrPage, recruiterAccount.email, recruiterAccount.password);
    await activeHrPage.getByRole("button", { name: "Công ty & thành viên", exact: true }).click();
    await expect(activeHrPage.getByText(/Công ty đã được duyệt hoạt động/)).toBeVisible();
    await expect(activeHrPage.getByLabel("Tên pháp lý", { exact: true })).toBeDisabled();
    await expect(activeHrPage.getByLabel("Quốc gia", { exact: true })).toBeDisabled();
    await expect(activeHrPage.getByLabel("Mã đăng ký", { exact: true })).toBeDisabled();

    const companies = (await apiJson(activeHrPage, "/api/v2/companies")) as Array<{
      companyId: string;
      legalName: string;
      displayName: string;
      slug: string;
      countryCode: string;
      registrationNumber: string;
      version: number;
      status: string;
    }>;
    const activeCompany = companies.find((c) => c.status === "ACTIVE");
    expect(activeCompany).toBeTruthy();
    const illegalUpdate = await activeHrPage.request.put(`/api/v2/companies/${activeCompany!.companyId}`, {
      headers: await authHeaders(activeHrPage),
      data: {
        legalName: "Đổi Tên Trái Phép",
        displayName: activeCompany!.displayName,
        slug: activeCompany!.slug,
        countryCode: activeCompany!.countryCode,
        registrationNumber: activeCompany!.registrationNumber,
        version: activeCompany!.version
      }
    });
    expect(illegalUpdate.status()).toBe(400);
  } finally {
    await activeHrPage.close();
  }
});

test("Chặng 3 - Nhánh 1: JD Tiptap, chọn đúng CV thứ 2 qua Match Widget, sàng lọc đến Shortlist, Analytics và Đóng tin CLOSED", async ({
  browser
}) => {
  test.setTimeout(180_000);
  const ts = Date.now();
  const jobTitle = `Chặng 3 Java Architect ${ts}`;
  const candEmail = `e2e.cand.${ts}@smart.local`;
  const candPassword = "CandidatePassword!2026";

  const hrPage = await browser.newPage();
  const candPage = await browser.newPage();

  try {
    // 1) HR creates Tiptap IT job with deadline + seniority, confirms ParsedJD, and publishes
    await login(hrPage, recruiterAccount.email, recruiterAccount.password);
    await hrPage.getByRole("button", { name: "Tin & ứng viên", exact: true }).click();
    await hrPage.getByRole("button", { name: "+ Tạo JD mới", exact: true }).click();

    await hrPage.getByLabel("Tiêu đề", { exact: true }).fill(jobTitle);
    await hrPage.getByRole("combobox", { name: "Cấp độ" }).selectOption("SENIOR");
    await hrPage.getByLabel("Hạn nhận hồ sơ", { exact: true }).fill("2030-12-30T17:00");
    await hrPage.getByLabel("Mô tả công việc", { exact: true }).fill("Phát triển dịch vụ backend hiệu năng cao bằng Java và Kafka.");
    await hrPage.getByLabel("Yêu cầu", { exact: true }).fill("Required: Java, Kafka, NewFrameworkX.\nPreferred: Docker.");
    await hrPage.getByLabel("Quyền lợi", { exact: true }).fill("Thưởng hiệu suất và bảo hiểm sức khỏe.");

    await hrPage.getByRole("button", { name: "Tạo bản nháp", exact: true }).click();
    await expect(hrPage.getByRole("button", { name: "Đăng JD", exact: true })).toBeVisible();

    await hrPage.getByRole("button", { name: "Kiểm tra yêu cầu", exact: true }).click();
    await expect(hrPage.getByRole("button", { name: "Xác nhận yêu cầu tuyển dụng", exact: true })).toBeVisible({
      timeout: 45_000
    });
    await hrPage.getByRole("button", { name: "Xác nhận yêu cầu tuyển dụng", exact: true }).click();
    await expect(
      hrPage.getByText("Đã xác nhận yêu cầu tuyển dụng. Trạng thái đăng tin sẽ cập nhật sau khi xử lý.")
    ).toBeVisible();

    await hrPage.getByRole("button", { name: "Chi tiết tin tuyển dụng", exact: true }).click();
    await expect(async () => {
      await hrPage.getByRole("button", { name: "Đăng JD", exact: true }).click();
      await expect(hrPage.getByRole("button", { name: "Đóng JD", exact: true })).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 30_000 });

    // Grab jobId from URL/API for clean verification
    const jobsList = (await apiJson(hrPage, `/api/v2/public/jobs?page=0&size=5&q=${encodeURIComponent(jobTitle)}`)) as {
      items: Array<{ jobId: string; title: string }>;
    };
    const publishedJob = jobsList.items.find((j) => j.title === jobTitle);
    expect(publishedJob).toBeTruthy();
    const jobId = publishedJob!.jobId;

    // 2) Candidate registers + verifies email + confirms 2 CVs, matches with CV #2, and submits CV #2
    await registerAndVerifyViaMailpit(candPage, candEmail, candPassword, "CANDIDATE");
    await login(candPage, candEmail, candPassword);
    await apiJson(candPage, "/api/v2/candidates/me", "PUT", {
      displayName: `Ứng viên Chặng 3 ${ts}`,
      headline: "Senior Backend Engineer",
      locationText: "Hà Nội",
      visibility: "APPLICATION_ONLY",
      version: null
    });

    const cv1 = await uploadAndConfirmCv(candPage, `CV Thu Nhat ${ts}`, "minimal-cv.pdf");
    const cv2 = await uploadAndConfirmCv(candPage, `CV Thu Hai ${ts}`, "job-scoped-skills-cv.pdf");

    await candPage.goto(`/jobs/${jobId}`);
    await expect(candPage.getByRole("heading", { name: jobTitle, level: 1 })).toBeVisible();
    await expect(candPage.getByText(/Phát triển dịch vụ backend/)).toBeVisible();
    await expect(candPage.locator("main")).not.toContainText("<p>");

    // Pick CV #2 in PreApplyMatchWidget -> run match -> click apply from widget
    const matchSelect = candPage.locator("#pre-match-cv-select");
    await expect(matchSelect).toBeVisible();
    await matchSelect.selectOption(cv2.cvId);
    await candPage.getByRole("button", { name: "⚡ Kiểm tra ngay" }).click();
    await expect(candPage.getByRole("button", { name: "Ứng tuyển vị trí này với CV đã chọn" })).toBeVisible({
      timeout: 30_000
    });
    await candPage.getByRole("button", { name: "Ứng tuyển vị trí này với CV đã chọn" }).click();

    const modal = candPage.getByRole("dialog");
    await expect(modal).toBeVisible();
    await expect(modal.locator("#candidate-apply-cv-select")).toHaveValue(cv2.cvId);
    expect(cv1.cvId).not.toBe(cv2.cvId);

    const submitPromise = candPage.waitForResponse(
      (res) => res.request().method() === "POST" && new URL(res.url()).pathname === "/api/v2/candidate/applications"
    );
    await modal.getByRole("checkbox").check();
    await modal.getByRole("button", { name: "Ứng tuyển", exact: true }).click();
    const submitRes = await submitPromise;
    expect(submitRes.status()).toBe(201);
    const createdApp = (await submitRes.json()) as {
      applicationId: string;
      cvId: string;
      cvVersionId: string;
    };
    expect(createdApp.cvId).toBe(cv2.cvId);
    expect(createdApp.cvVersionId).toBe(cv2.versionId);

    // JobDetailPage now shows "Đã ứng tuyển" instead of "Ứng tuyển vị trí này"
    await candPage.reload();
    await expect(candPage.getByText(/Đã ứng tuyển · Mới ứng tuyển/)).toBeVisible();
    await expect(candPage.getByRole("button", { name: "Ứng tuyển vị trí này" })).toHaveCount(0);

    // 3) HR opens Kanban, shortlists the CV, verifies analytics and closes the job.
    await hrPage.getByRole("button", { name: /Ứng viên & Pipeline/ }).click();
    const kanbanFetch = hrPage.waitForResponse(
      (res) =>
        res.request().method() === "GET" &&
        res.url().includes("/api/v2/recruiter/applications") &&
        res.url().includes("size=100")
    );
    await hrPage.getByRole("button", { name: "Bảng Kanban" }).click();
    expect((await kanbanFetch).ok()).toBeTruthy();

    await hrPage.getByRole("button", { name: "Danh sách" }).click();
    const detail = hrPage.locator(".application-detail");
    await expect(detail).toBeVisible({ timeout: 20_000 });
    await detail.getByRole("button", { name: "Bắt đầu xem xét", exact: true }).click();
    await detail.getByRole("button", { name: "Đưa vào shortlist", exact: true }).click();
    await expect(detail).toContainText("Danh sách rút gọn");
    await expect(detail.getByRole("button", { name: "Đang phỏng vấn", exact: true })).toHaveCount(0);

    // Verify cumulative Analytics
    await hrPage.getByRole("button", { name: "Thống kê tin này", exact: true }).click();
    const analyticsSection = hrPage.getByRole("region", { name: "Báo cáo thống kê tin tuyển dụng" });
    await expect(analyticsSection).toContainText(`Báo cáo thống kê: ${jobTitle}`);
    await expect(analyticsSection).toContainText("Tỷ lệ: 100%");

    // Close job -> verifies ck_jobs_lifecycle + public/apply blocking
    await hrPage.getByRole("button", { name: "Đóng JD" }).click();
    await expect(hrPage.getByText("Đã đóng")).toBeVisible();

    // Closed job is hidden from public search and blocks applications
    const publicSearchAfterClose = (await apiJson(
      candPage,
      `/api/v2/public/jobs?page=0&size=5&jobId=${jobId}`
    )) as { items: unknown[] };
    expect(publicSearchAfterClose.items).toHaveLength(0);

    const applyClosed = await candPage.request.post("/api/v2/candidate/applications", {
      headers: await authHeaders(candPage),
      data: {
        jobId,
        cvId: cv1.cvId,
        cvVersionId: cv1.versionId,
        consentAccepted: true,
        policyVersion: "cv-sharing-v1"
      }
    });
    expect([400, 409]).toContain(applyClosed.status());

    // Duplicate closed JD as editable draft
    await hrPage.getByRole("button", { name: "Chi tiết tin tuyển dụng", exact: true }).click();
    await hrPage.getByRole("button", { name: "Nhân bản thành bản nháp" }).click();
    await expect(hrPage.getByLabel("Tiêu đề", { exact: true })).toHaveValue(`${jobTitle} (Bản sao)`);
    await expect(hrPage.getByRole("button", { name: "Tạo bản nháp", exact: true })).toBeEnabled();
  } finally {
    await hrPage.close();
    await candPage.close();
  }
});

test("Chặng 3 - Nhánh 2 & 3: Từ chối REJECTED thu hồi CV/điểm, Ngoài IT chạy thủ công, và Notification unreadOnly", async ({
  browser
}) => {
  test.setTimeout(180_000);
  const ts = Date.now();
  const hrPage = await browser.newPage();
  const candPage = await browser.newPage();

  try {
    await login(hrPage, recruiterAccount.email, recruiterAccount.password);
    await login(candPage, candidateAccount.email, candidateAccount.password);

    // Ensure candidate has a confirmed CV
    const cv = await uploadAndConfirmCv(candPage, `CV Chặng 3 Reject ${ts}`, "job-scoped-skills-cv.pdf");
    const companies = (await apiJson(hrPage, "/api/v2/companies")) as Array<{ companyId: string; status: string }>;
    const companyId = companies.find((c) => c.status === "ACTIVE")!.companyId;

    // Job A (IT) for REJECTED privacy revocation
    const itJob = await apiJson(hrPage, `/api/v2/companies/${companyId}/jobs`, "POST", {
      title: `Chặng 3 Reject IT ${ts}`,
      description: "Java backend maintenance.",
      requirementsText: "Required: Java and SQL.",
      openings: 1,
      salaryNegotiable: true,
      externalAiConsent: false
    });
    await expect
      .poll(
        async () => (await hrPage.request.get(`/api/v2/parsed-jds/${itJob.jobVersionId}`, { headers: await authHeaders(hrPage) })).status(),
        { timeout: 45_000 }
      )
      .toBe(200);
    const parsedIt = await apiJson(hrPage, `/api/v2/parsed-jds/${itJob.jobVersionId}`);
    await apiJson(hrPage, `/api/v2/parsed-jds/${itJob.jobVersionId}/confirm`, "POST", {
      expectedRevisionId: parsedIt.revisionId
    });
    await expect
      .poll(
        async () => {
          const latestItJob = await apiJson(hrPage, `/api/v2/jobs/${itJob.jobId}`);
          const res = await hrPage.request.post(
            `/api/v2/jobs/${itJob.jobId}/publish?version=${latestItJob.version}`,
            { headers: await authHeaders(hrPage) }
          );
          return res.status();
        },
        { timeout: 30_000 }
      )
      .toBe(200);

    const appIt = await apiJson(
      candPage,
      "/api/v2/candidate/applications",
      "POST",
      {
        jobId: itJob.jobId,
        cvId: cv.cvId,
        cvVersionId: cv.versionId,
        consentAccepted: true,
        policyVersion: "cv-sharing-v1"
      },
      201
    );
    expect((await hrPage.request.get(`/api/v2/recruiter/applications/${appIt.applicationId}/cv`, { headers: await authHeaders(hrPage) })).status()).toBe(200);

    // Reject via UI ReasonDialog
    await hrPage.goto(`/recruiter/jobs/${itJob.jobId}`);
    await expect(hrPage.locator(".application-detail")).toBeVisible({ timeout: 20_000 });
    await hrPage.getByRole("button", { name: "Từ chối", exact: true }).click();
    const reasonModal = hrPage.getByRole("dialog");
    await reasonModal.getByLabel("Lý do").fill("Chưa phù hợp yêu cầu hiện tại");
    await reasonModal.getByRole("button", { name: "Xác nhận từ chối", exact: true }).click();
    await expect(hrPage.locator(".application-detail")).toContainText(
      "Hồ sơ đã bị từ chối nên quyền xem CV và điểm AI đã tự động đóng."
    );

    const cvAfterReject = await hrPage.request.get(`/api/v2/recruiter/applications/${appIt.applicationId}/cv`, {
      headers: await authHeaders(hrPage)
    });
    expect([403, 404]).toContain(cvAfterReject.status());
    const matchAfterReject = await hrPage.request.get(`/api/v2/applications/${appIt.applicationId}/match`, {
      headers: await authHeaders(hrPage)
    });
    expect([400, 403, 404]).toContain(matchAfterReject.status());

    // Branch 3: Outside-IT manual review workflow (no ParsedJD wait, no AI score)
    const manualJob = await apiJson(hrPage, `/api/v2/companies/${companyId}/jobs`, "POST", {
      title: `Chặng 3 Kế toán ngoài IT ${ts}`,
      description: "Quản lý sổ sách kế toán tổng hợp.",
      requirementsText: "Kinh nghiệm kế toán 2 năm.",
      openings: 1,
      salaryNegotiable: true,
      externalAiConsent: false,
      category: {
        industryName: `Ngành Kế toán Kiểm toán ${ts}`,
        specializationName: "Kế toán tổng hợp",
        positionName: "Chuyên viên kế toán"
      }
    });
    expect(manualJob.matchingSupported).toBe(false);
    await apiJson(hrPage, `/api/v2/jobs/${manualJob.jobId}/publish?version=${manualJob.version}`, "POST");

    await apiJson(
      candPage,
      "/api/v2/candidate/applications",
      "POST",
      {
        jobId: manualJob.jobId,
        cvId: cv.cvId,
        cvVersionId: cv.versionId,
        consentAccepted: true,
        policyVersion: "cv-sharing-v1"
      },
      201
    );

    await hrPage.goto(`/recruiter/jobs/${manualJob.jobId}`);
    await expect(hrPage.getByRole("table", { name: "Danh sách ứng viên" })).toContainText("Xem xét thủ công");
    await hrPage.getByRole("button", { name: "Bắt đầu xem xét", exact: true }).click();
    await hrPage.getByRole("button", { name: "Đưa vào shortlist", exact: true }).click();
    await expect(hrPage.locator(".application-detail")).toContainText("Danh sách rút gọn");

    // Notification unreadOnly filter in NotificationCenter
    await candPage.goto("/candidate/notifications");
    const unreadTab = candPage.getByRole("tab", { name: /Chưa đọc/ });
    await expect(unreadTab).toBeVisible();
    const unreadReq = candPage.waitForResponse(
      (res) => res.url().includes("/api/v2/notifications?") && res.url().includes("unreadOnly=true")
    );
    await unreadTab.click();
    expect((await unreadReq).status()).toBe(200);
  } finally {
    await hrPage.close();
    await candPage.close();
  }
});
