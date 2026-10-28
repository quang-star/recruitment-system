import { expect, Page, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

async function login(page: Page, email: string, password: string) {
  await page.goto("/?auth=login");
  await page.locator("form").getByLabel("Email").fill(email);
  await page.locator("form").getByLabel("Mật khẩu").fill(password);
  await page.locator("form").getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(sessionStorage.getItem("smart-recruitment.session")))).toBe(true);
}
async function headers(page: Page) {
  const token = await page.evaluate(() => JSON.parse(sessionStorage.getItem("smart-recruitment.session")!).accessToken as string);
  return { Authorization: `Bearer ${token}`, "Idempotency-Key": crypto.randomUUID() };
}
async function call(page: Page, url: string, method = "GET", data?: unknown, expected = 200) {
  const response = await page.request.fetch(url, { method, data, headers: await headers(page) });
  let error = null;
  if (response.status() !== expected) {
    try { error = await response.json(); }
    catch { error = { code: "NON_JSON_RESPONSE", message: `HTTP ${response.status()}` }; }
  }
  expect(response.status(), `${method} ${url}: ${error?.code ?? ""} ${error?.message ?? error?.detail ?? error?.error ?? ""}`).toBe(expected);
  try { return await response.json(); } catch { return null; }
}

test("Recruiter career suggestions preserve an unsaved manual draft when QA providers are disabled", async ({ browser }) => {
  const recruiter = await browser.newPage();
  const candidate = await browser.newPage();
  try {
    await login(recruiter, "recruiter.demo@smart.local", "DemoRecruiter!2026");
    await recruiter.getByRole("button", { name: "Tin & ứng viên", exact: true }).click();
    await recruiter.getByRole("button", { name: "+ Tạo JD mới", exact: true }).click();
    const draftTitle = `Synthetic accounting draft ${Date.now()}`;
    await recruiter.getByLabel("Tiêu đề", { exact: true }).fill(draftTitle);
    await recruiter.getByLabel("Mô tả công việc", { exact: true }).fill("Prepare financial reports and accounting statements.");
    await recruiter.getByLabel("Yêu cầu", { exact: true }).fill("Accounting experience and spreadsheet skills.");
    await recruiter.getByLabel("Ngành", { exact: true }).selectOption("");
    await recruiter.getByLabel("Tên ngành mới", { exact: true }).fill("Synthetic accounting industry");
    await recruiter.getByLabel("Tên vị trí mới", { exact: true }).fill("Synthetic accountant");
    const section = recruiter.getByRole("region", { name: "Gợi ý phân loại nghề", exact: true });
    const trigger = section.getByRole("button", { name: "Gợi ý phân loại nghề", exact: true });
    await expect(trigger).toBeDisabled();
    const consent = recruiter.getByRole("checkbox", { name: "Cho phép dịch vụ AI bên ngoài hỗ trợ phân tích nội dung này" });
    await consent.check();
    const writes: string[] = [];
    recruiter.on("request", (request) => {
      if (request.method() === "POST" || request.method() === "PUT") writes.push(new URL(request.url()).pathname);
    });
    const responsePromise = recruiter.waitForResponse((response) => response.request().method() === "POST"
      && new URL(response.url()).pathname === "/api/v2/parsed-jds/category-suggestions");
    await trigger.click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ status: "MANUAL", reasonCode: "EXTERNAL_AI_NOT_CONFIGURED", suggestions: [] });
    await expect(section.getByRole("status")).toContainText("Gợi ý nghề hiện chưa khả dụng");
    await expect(section.getByRole("button", { name: /Áp dụng gợi ý/ })).toHaveCount(0);
    await expect(recruiter.getByLabel("Tiêu đề", { exact: true })).toHaveValue(draftTitle);
    await expect(recruiter.getByLabel("Tên ngành mới", { exact: true })).toHaveValue("Synthetic accounting industry");
    await expect(recruiter.getByLabel("Tên vị trí mới", { exact: true })).toHaveValue("Synthetic accountant");
    expect(writes.filter((url) => /^\/api\/v1\/(companies\/[^/]+\/jobs|jobs\/|dashboard\/catalog)/.test(url))).toEqual([]);
    expect(writes.filter((url) => url === "/api/v2/parsed-jds/category-suggestions")).toHaveLength(1);
    await consent.uncheck();
    await expect(trigger).toBeDisabled();
    await expect(section.getByRole("status")).toHaveCount(0);
    await login(candidate, "candidate.demo@smart.local", "DemoCandidate!2026");
    await call(candidate, "/api/v2/parsed-jds/category-suggestions", "POST", { title: "Synthetic draft" }, 403);
  } finally { await recruiter.close(); await candidate.close(); }
});

test("Admin reviews deferred proposals with reasons, versioned definitions and immutable source snapshots", async ({ browser }) => {
  test.setTimeout(120_000);
  test.skip(!process.env.E2E_ADMIN_EMAIL, "Requires a verified SYSTEM_ADMIN test account");
  const recruiter = await browser.newPage();
  await login(recruiter, "recruiter.demo@smart.local", "DemoRecruiter!2026");
  const companies = await call(recruiter, "/api/v2/companies");
  const industryName = `Synthetic industry ${Date.now()}`;
  const job = await call(recruiter, `/api/v2/companies/${companies[0].companyId}/jobs`, "POST", {
    title: `Synthetic outside position ${Date.now()}`, description: "Synthetic recruitment description",
    requirementsText: "Synthetic manual requirements", openings: 1, salaryNegotiable: false, externalAiConsent: false,
    category: { industryName, specializationName: "Synthetic group", positionName: "Synthetic position" }
  });
  expect(job.matchingSupported).toBe(false);
  expect(job.category.matchingDomain).toBe("OUTSIDE_IT");
  await call(recruiter, `/api/v2/jobs/${job.jobId}/publish?version=${job.version}`, "POST");
  const admin = await browser.newPage();
  await login(admin, process.env.E2E_ADMIN_EMAIL!, process.env.E2E_ADMIN_PASSWORD ?? "SyntheticAdmin!2026");
  await expect(admin.getByRole("heading", { name: "Ngành, nhóm chuyên môn và vị trí" })).toBeVisible();
  const categories = await call(admin, "/api/v2/dashboard/catalog");
  const proposed = categories.find((entry: { name: string }) => entry.name === industryName);
  expect(proposed.status).toBe("PENDING");
  await admin.getByLabel("Danh mục", { exact: true }).selectOption(proposed.id);
  await admin.getByRole("button", { name: "Tạm hoãn", exact: true }).click();
  await expect(admin.getByRole("alert")).toContainText("Nhập lý do");
  expect((await call(admin, "/api/v2/dashboard/catalog")).find((entry: { id: string }) => entry.id === proposed.id).version).toBe(proposed.version);
  await admin.getByLabel("Lý do thay đổi").fill("Synthetic category requires additional review");
  await admin.getByRole("button", { name: "Tạm hoãn", exact: true }).click();
  await expect(admin.getByRole("option", { name: `${industryName} · DEFERRED`, exact: true })).toHaveCount(1);
  await admin.getByLabel("Danh mục", { exact: true }).selectOption(proposed.id);
  await expect(admin.getByRole("button", { name: "Lưu sửa đổi", exact: true })).toBeDisabled();
  await expect(admin.getByRole("button", { name: "Duyệt", exact: true })).toHaveCount(0);
  await admin.getByLabel("Lý do thay đổi").fill("Synthetic category has sufficient evidence");
  await admin.getByRole("button", { name: "Mở lại đề xuất", exact: true }).click();
  await expect(admin.getByRole("option", { name: `${industryName} · PENDING`, exact: true })).toHaveCount(1);
  await admin.getByLabel("Danh mục", { exact: true }).selectOption(proposed.id);
  const reviewedIndustryName = `${industryName} reviewed`;
  await admin.getByLabel("Tên", { exact: true }).fill(reviewedIndustryName);
  await admin.getByLabel("Lý do thay đổi").fill("Synthetic category name verified before approval");
  await admin.getByRole("button", { name: "Duyệt", exact: true }).click();
  await expect(admin.getByRole("option", { name: `${reviewedIndustryName} · ACTIVE`, exact: true })).toHaveCount(1);
  const unchanged = await call(recruiter, `/api/v2/public/jobs?page=0&size=1&jobId=${job.jobId}`);
  expect(unchanged.items[0].category).toEqual(job.category);
  const history = await call(admin, `/api/v2/dashboard/catalog/${proposed.id}/history`);
  const adminId = await admin.evaluate(() => JSON.parse(sessionStorage.getItem("smart-recruitment.session")!).userId as string);
  expect(history.filter((entry: { action: string }) => ["DEFER", "REOPEN", "APPROVE"].includes(entry.action)).map((entry: { action: string }) => entry.action)).toEqual(["APPROVE", "REOPEN", "DEFER"]);
  expect(history[0]).toMatchObject({ action: "APPROVE", actorUserId: adminId, version: proposed.version + 3,
    reason: "Synthetic category name verified before approval" });
  expect(history[0].correlationId).toMatch(/^[0-9a-f-]{36}$/i);
  await admin.getByLabel("Danh mục", { exact: true }).selectOption(proposed.id);
  await admin.getByRole("button", { name: "Xem lịch sử thay đổi" }).click();
  await expect(admin.getByRole("region", { name: "Lịch sử thay đổi" })).toContainText("Synthetic category name verified before approval");
  await expect(admin.getByRole("region", { name: "Lịch sử thay đổi" })).toContainText(adminId);
  await call(admin, `/api/v2/dashboard/catalog/${proposed.id}`, "PUT", { version: proposed.version,
    action: "APPROVE", reason: "Synthetic stale category review" }, 409);
  await admin.getByRole("button", { name: "Kỹ năng / tên gọi khác" }).click();
  await expect(admin.getByRole("heading", { name: "Kỹ năng và tên gọi khác" })).toBeVisible();
  const skillName = `SyntheticTool${Date.now()}`;
  const initialCatalog = await call(admin, "/api/v2/taxonomy/skills");
  const targetSkill = initialCatalog.skills.find((entry: { status: string }) => entry.status === "ACTIVE");
  expect(targetSkill).toBeTruthy();
  await admin.getByLabel("Tên", { exact: true }).fill(skillName);
  await admin.getByLabel("Tên gọi khác (mỗi dòng một tên)").fill(`${skillName}Alias`);
  await admin.getByLabel("Loại kỹ năng", { exact: true }).selectOption("framework");
  await admin.getByLabel("Nhóm kỹ năng", { exact: true }).selectOption("backend");
  await admin.getByRole("button", { name: "Thêm quan hệ", exact: true }).click();
  await admin.getByLabel("Kỹ năng đích 1", { exact: true }).selectOption(targetSkill.stableId);
  await admin.getByLabel("Lý do thay đổi").fill("Synthetic skill definition verified");
  const savedSkill = admin.waitForResponse((response) => response.request().method() === "POST"
    && new URL(response.url()).pathname === "/api/v2/taxonomy/skills");
  await admin.getByRole("button", { name: "Thêm danh mục", exact: true }).click();
  expect((await savedSkill).status()).toBe(200);
  await expect(admin.getByRole("option", { name: `${skillName} · ACTIVE`, exact: true })).toHaveCount(1);
  const catalog = await call(admin, "/api/v2/taxonomy/skills");
  const skill = catalog.skills.find((entry: { canonicalName: string }) => entry.canonicalName === skillName);
  expect(skill.aliases[0].value).toBe(`${skillName}Alias`);
  expect(skill).toMatchObject({ type: "framework", category: "backend", relations: [{ type: "RELATED", targetSkillId: targetSkill.stableId }] });
  expect(catalog.taxonomyVersion).not.toBe(initialCatalog.taxonomyVersion);
  await call(admin, "/api/v2/taxonomy/skills", "POST", { version: initialCatalog.version, action: "EDIT",
    skillId: skill.stableId, name: skillName, reason: "Synthetic stale skill review" }, 409);

  const pendingSkillName = `SyntheticPending${Date.now()}`;
  const skillJob = await call(recruiter, `/api/v2/companies/${companies[0].companyId}/jobs`, "POST", {
    title: `Synthetic Java position ${Date.now()}`, description: "Develop Java backend services and reliable integrations.",
    requirementsText: `Required: Java and ${pendingSkillName}.`, openings: 1, salaryNegotiable: false, externalAiConsent: false
  });
  await expect.poll(async () => (await recruiter.request.get(`/api/v2/parsed-jds/${skillJob.jobVersionId}`,
    { headers: await headers(recruiter) })).status(), { timeout: 45_000 }).toBe(200);
  const parsedJd = await call(recruiter, `/api/v2/parsed-jds/${skillJob.jobVersionId}`);
  parsedJd.payload.requirements.requiredSkills.push({ raw: pendingSkillName, canonicalSkillId: null,
    normalizationStatus: "PENDING", criticality: "CRITICAL", minimumMonths: null, evidenceIds: [], confidence: 1, confirmedByRecruiter: false });
  const pendingRevision = await call(recruiter, `/api/v2/parsed-jds/${skillJob.jobVersionId}`, "PATCH",
    { expectedRevisionId: parsedJd.revisionId, payload: parsedJd.payload });
  const proposalCatalog = await call(admin, "/api/v2/taxonomy/skills");
  expect(proposalCatalog.taxonomyVersion).toBe(catalog.taxonomyVersion);
  const pendingSkill = proposalCatalog.skills.find((entry: { canonicalName: string }) => entry.canonicalName === pendingSkillName);
  expect(pendingSkill.status).toBe("PENDING");
  await admin.reload();
  await admin.getByRole("button", { name: "Kỹ năng / tên gọi khác" }).click();
  await expect(admin.getByRole("option", { name: `${pendingSkillName} · PENDING`, exact: true })).toHaveCount(1);
  await admin.getByLabel("Danh mục", { exact: true }).selectOption(pendingSkill.stableId);
  await admin.getByLabel("Lý do thay đổi").fill("Synthetic skill needs evidence review");
  await admin.getByRole("button", { name: "Tạm hoãn", exact: true }).click();
  await expect(admin.getByRole("option", { name: `${pendingSkillName} · DEFERRED`, exact: true })).toHaveCount(1);
  const deferredCatalog = await call(admin, "/api/v2/taxonomy/skills");
  expect(deferredCatalog.version).toBe(proposalCatalog.version + 1);
  expect(deferredCatalog.taxonomyVersion).toBe(proposalCatalog.taxonomyVersion);
  await admin.getByLabel("Danh mục", { exact: true }).selectOption(pendingSkill.stableId);
  await admin.getByLabel("Lý do thay đổi").fill("Synthetic skill review resumed");
  await admin.getByRole("button", { name: "Mở lại đề xuất", exact: true }).click();
  await expect(admin.getByRole("option", { name: `${pendingSkillName} · PENDING`, exact: true })).toHaveCount(1);
  expect((await call(admin, "/api/v2/taxonomy/skills")).taxonomyVersion).toBe(proposalCatalog.taxonomyVersion);
  await admin.getByLabel("Danh mục", { exact: true }).selectOption(pendingSkill.stableId);
  const approvedSkillName = `${pendingSkillName}Verified`;
  await admin.getByLabel("Tên", { exact: true }).fill(approvedSkillName);
  await admin.getByLabel("Tên gọi khác (mỗi dòng một tên)").fill(pendingSkillName);
  await admin.getByLabel("Loại kỹ năng", { exact: true }).selectOption("library");
  await admin.getByLabel("Nhóm kỹ năng", { exact: true }).selectOption("frontend");
  await admin.getByRole("button", { name: "Thêm quan hệ", exact: true }).click();
  await admin.getByLabel("Loại quan hệ 1", { exact: true }).selectOption("NARROWER");
  await admin.getByLabel("Kỹ năng đích 1", { exact: true }).selectOption(targetSkill.stableId);
  await admin.getByLabel("Lý do thay đổi").fill("Synthetic skill name and relationships verified");
  await admin.getByRole("button", { name: "Duyệt", exact: true }).click();
  await expect(admin.getByRole("option", { name: `${approvedSkillName} · ACTIVE`, exact: true })).toHaveCount(1);
  const approvedCatalog = await call(admin, "/api/v2/taxonomy/skills");
  const approvedSkill = approvedCatalog.skills.find((entry: { stableId: string }) => entry.stableId === pendingSkill.stableId);
  expect(approvedSkill).toMatchObject({ canonicalName: approvedSkillName, type: "library", category: "frontend",
    aliases: [{ value: pendingSkillName, normalized: pendingSkillName.toLowerCase(), language: "neutral" }],
    relations: [{ type: "NARROWER", targetSkillId: targetSkill.stableId }] });
  expect(approvedCatalog.taxonomyVersion).not.toBe(proposalCatalog.taxonomyVersion);
  expect((await call(recruiter, `/api/v2/parsed-jds/${skillJob.jobVersionId}`)).payload).toEqual(pendingRevision.payload);
  const skillHistory = await call(admin, `/api/v2/taxonomy/skills/${pendingSkill.stableId}/history`);
  expect(skillHistory.slice(0, 3).map((entry: { action: string }) => entry.action)).toEqual(["APPROVE", "REOPEN", "DEFER"]);
  expect(skillHistory[0]).toMatchObject({ actorId: adminId, version: approvedCatalog.version,
    reason: "Synthetic skill name and relationships verified" });
  expect(skillHistory[0].correlationId).toMatch(/^[0-9a-f-]{36}$/i);
  await admin.getByLabel("Danh mục", { exact: true }).selectOption(pendingSkill.stableId);
  await admin.getByRole("button", { name: "Xem lịch sử thay đổi" }).click();
  await expect(admin.getByRole("region", { name: "Lịch sử thay đổi" })).toContainText("Synthetic skill name and relationships verified");
  await expect(admin.getByRole("region", { name: "Lịch sử thay đổi" })).toContainText(adminId);
  await recruiter.close(); await admin.close();
});

test("Admin skill sources deduplicate JD revisions and confirmations and disappear after CV erasure", async ({ browser }) => {
  test.setTimeout(180_000);
  test.skip(!process.env.E2E_ADMIN_EMAIL, "Requires a verified SYSTEM_ADMIN test account");
  const recruiter = await browser.newPage();
  const candidate = await browser.newPage();
  const admin = await browser.newPage();
  try {
    await login(recruiter, "recruiter.demo@smart.local", "DemoRecruiter!2026");
    await login(candidate, "candidate.demo@smart.local", "DemoCandidate!2026");
    await login(admin, process.env.E2E_ADMIN_EMAIL!, process.env.E2E_ADMIN_PASSWORD ?? "SyntheticAdmin!2026");
    await call(candidate, "/api/v2/taxonomy/pending-skills", "GET", undefined, 403);
    await call(recruiter, "/api/v2/taxonomy/pending-skills", "GET", undefined, 403);
    const term = `SyntheticSource${Date.now()}`;
    const companies = await call(recruiter, "/api/v2/companies");
    const job = await call(recruiter, `/api/v2/companies/${companies[0].companyId}/jobs`, "POST", {
      title: `Synthetic Java source role ${Date.now()}`, description: "Develop Java services and reliable integrations.",
      requirementsText: `Required: Java and ${term}.`, openings: 1, salaryNegotiable: false, externalAiConsent: false
    });
    await expect.poll(async () => (await recruiter.request.get(`/api/v2/parsed-jds/${job.jobVersionId}`,
      { headers: await headers(recruiter) })).status(), { timeout: 45_000 }).toBe(200);
    const parsedJd = await call(recruiter, `/api/v2/parsed-jds/${job.jobVersionId}`);
    parsedJd.payload.requirements.requiredSkills.push({ raw: term, canonicalSkillId: null, normalizationStatus: "PENDING",
      criticality: "CRITICAL", minimumMonths: null, evidenceIds: [], confidence: 1, confirmedByRecruiter: false });
    const firstJd = await call(recruiter, `/api/v2/parsed-jds/${job.jobVersionId}`, "PATCH",
      { expectedRevisionId: parsedJd.revisionId, payload: parsedJd.payload });
    const proposed = (await call(admin, `/api/v2/taxonomy/pending-skills?q=${term}`)).items.find((entry: { name: string }) => entry.name === term);
    expect(proposed).toMatchObject({ occurrenceCount: 1, sourceCount: 1, status: "PENDING" });
    await call(candidate, `/api/v2/taxonomy/pending-skills/${proposed.skillId}`, "GET", undefined, 403);
    await call(candidate, `/api/v2/taxonomy/pending-skills/${proposed.skillId}/occurrences`, "GET", undefined, 403);
    const confirmedJd = await call(recruiter, `/api/v2/parsed-jds/${job.jobVersionId}/confirm`, "POST", { expectedRevisionId: firstJd.revisionId });
    await call(recruiter, `/api/v2/parsed-jds/${job.jobVersionId}/confirm`, "POST", { expectedRevisionId: firstJd.revisionId });
    const revisedJd = await call(recruiter, `/api/v2/parsed-jds/${job.jobVersionId}`, "PATCH",
      { expectedRevisionId: confirmedJd.revisionId, payload: confirmedJd.payload });
    await call(recruiter, `/api/v2/parsed-jds/${job.jobVersionId}/confirm`, "POST", { expectedRevisionId: revisedJd.revisionId });
    expect(await call(admin, `/api/v2/taxonomy/pending-skills/${proposed.skillId}`)).toMatchObject({ occurrenceCount: 1, sourceCount: 1 });
    const jdSources = await call(admin, `/api/v2/taxonomy/pending-skills/${proposed.skillId}/occurrences?sourceKind=JD`);
    expect(jdSources.totalElements).toBe(1);
    expect(jdSources.items[0]).toMatchObject({ sourceKind: "JD", sourceVersionId: job.jobVersionId,
      firstRevisionId: firstJd.revisionId, latestRevisionId: revisedJd.revisionId, fieldRole: "JD.requiredSkills", rawTerm: term });

    const upload = await candidate.request.post("/api/v2/cvs", { headers: await headers(candidate), multipart: {
      title: `Synthetic source CV ${Date.now()}`, file: { name: "synthetic-source.pdf", mimeType: "application/pdf",
        buffer: readFileSync(path.resolve("e2e/fixtures/job-scoped-skills-cv.pdf")) }
    }});
    expect(upload.status()).toBe(201);
    const cv = await upload.json();
    const cvVersionId = cv.activeVersion.cvVersionId;
    await expect.poll(async () => (await candidate.request.get(`/api/v2/parsed-cvs/${cvVersionId}`,
      { headers: await headers(candidate) })).status(), { timeout: 45_000 }).toBe(200);
    const parsedCv = await call(candidate, `/api/v2/parsed-cvs/${cvVersionId}`);
    parsedCv.payload.skills.push({ raw: term, canonicalSkillId: null, normalizationStatus: "PENDING",
      evidenceIds: [], confidence: 1, provenance: "USER_ASSERTED" });
    const revisedCv = await call(candidate, `/api/v2/parsed-cvs/${cvVersionId}`, "PUT",
      { cvId: cv.cvId, expectedRevisionId: parsedCv.revisionId, payload: parsedCv.payload });
    await call(candidate, `/api/v2/parsed-cvs/${cvVersionId}/confirm`, "POST", { expectedRevisionId: revisedCv.revisionId });
    await call(candidate, `/api/v2/parsed-cvs/${cvVersionId}/confirm`, "POST", { expectedRevisionId: revisedCv.revisionId });
    expect(await call(admin, `/api/v2/taxonomy/pending-skills/${proposed.skillId}`)).toMatchObject({ occurrenceCount: 2, sourceCount: 2 });
    const sources = await call(admin, `/api/v2/taxonomy/pending-skills/${proposed.skillId}/occurrences`);
    expect(sources.totalElements).toBe(2);
    const allowedSourceFields = ["occurrenceId", "sourceKind", "sourceVersionId", "firstRevisionId", "latestRevisionId", "fieldRole",
      "rawTerm", "provenance", "normalizationStatus", "confidence", "evidenceRefs", "context", "firstSeen", "lastSeen"];
    for (const source of sources.items) {
      expect(Object.keys(source).filter((key) => !allowedSourceFields.includes(key))).toEqual([]);
      expect(Object.keys(source.context).filter((key) => !["fieldRole", "provenance", "sourceConfirmed", "criticality", "knownSkillIds"].includes(key))).toEqual([]);
      expect(typeof source.context.sourceConfirmed).toBe("boolean");
      for (const reference of source.evidenceRefs) expect(Object.keys(reference).filter((key) => !["id", "page", "start", "end"].includes(key))).toEqual([]);
    }
    expect(sources.items.find((source: { sourceKind: string }) => source.sourceKind === "CV")).toMatchObject({
      sourceVersionId: cvVersionId, fieldRole: "CV.skills", provenance: "USER_ASSERTED", evidenceRefs: []
    });

    await admin.getByRole("button", { name: "Kỹ năng / tên gọi khác" }).click();
    const queue = admin.getByRole("region", { name: "Hàng chờ kỹ năng" });
    await queue.getByLabel("Tìm thuật ngữ", { exact: true }).fill(term);
    await queue.getByRole("button", { name: "Tìm kỹ năng", exact: true }).click();
    await expect(queue.getByRole("button", { name: term, exact: true })).toBeVisible();
    await expect(queue).toContainText("2 lần ghi nhận · 2 phiên bản nguồn");
    await queue.getByLabel("Nguồn đề xuất", { exact: true }).selectOption("CV");
    await expect(queue.getByRole("button", { name: term, exact: true })).toBeVisible();
    await expect(queue).toContainText("1 lần ghi nhận · 1 phiên bản nguồn");
    await queue.getByLabel("Nguồn đề xuất", { exact: true }).selectOption("");
    await queue.getByRole("button", { name: term, exact: true }).click();
    const sourceRegion = admin.getByRole("region", { name: "Nguồn kỹ năng", exact: true });
    await expect(sourceRegion).toContainText(cvVersionId);
    await expect(sourceRegion).toContainText(job.jobVersionId);
    await expect(sourceRegion.getByRole("link")).toHaveCount(0);
    await sourceRegion.getByLabel("Lọc nguồn ghi nhận", { exact: true }).selectOption("JD");
    await expect(sourceRegion).toContainText("1 lần ghi nhận · Trang 1");
    await expect(sourceRegion).not.toContainText(cvVersionId);
    await sourceRegion.getByLabel("Lọc nguồn ghi nhận", { exact: true }).selectOption("");
    await expect(sourceRegion).toContainText(cvVersionId);
    await admin.getByLabel("Lý do thay đổi", { exact: true }).fill("Synthetic review draft survives source refresh");

    await expect.poll(async () => (await call(candidate, "/api/v2/cvs")).find((entry: { cvId: string }) => entry.cvId === cv.cvId)?.activeVersion.processingStatus,
      { timeout: 30_000 }).toBe("CONFIRMED");
    const currentCv = (await call(candidate, "/api/v2/cvs")).find((entry: { cvId: string }) => entry.cvId === cv.cvId);
    await call(candidate, `/api/v2/cvs/${cv.cvId}?version=${currentCv.version}`, "DELETE", undefined, 202);
    await expect.poll(async () => (await call(admin, `/api/v2/taxonomy/pending-skills/${proposed.skillId}`)).sourceCount,
      { timeout: 45_000 }).toBe(1);
    const remaining = await call(admin, `/api/v2/taxonomy/pending-skills/${proposed.skillId}/occurrences`);
    expect(remaining.totalElements).toBe(1);
    expect(remaining.items[0].sourceKind).toBe("JD");
    expect(JSON.stringify(remaining)).not.toContain(cvVersionId);
    await sourceRegion.getByRole("button", { name: "Làm mới nguồn kỹ năng", exact: true }).click();
    await expect(sourceRegion).toContainText("1 lần ghi nhận · 1 phiên bản nguồn");
    await expect(sourceRegion).not.toContainText(cvVersionId);
    await expect(admin.getByRole("textbox", { name: "Lý do thay đổi", exact: true })).toHaveValue("Synthetic review draft survives source refresh");
    await queue.getByRole("button", { name: "Làm mới hàng chờ", exact: true }).click();
    await expect(queue).toContainText("1 lần ghi nhận · 1 phiên bản nguồn");
    await queue.getByLabel("Nguồn đề xuất", { exact: true }).selectOption("CV");
    await expect(queue.getByRole("button", { name: term, exact: true })).toHaveCount(0);
    await expect(queue).toContainText("Không có kỹ năng phù hợp bộ lọc.");
  } finally {
    await recruiter.close(); await candidate.close(); await admin.close();
  }
});

test("Admin reviews read-only skill rankings and searches separate Core and AI audit pages", async ({ browser }) => {
  test.setTimeout(120_000);
  test.skip(!process.env.E2E_ADMIN_EMAIL, "Requires a verified SYSTEM_ADMIN test account");
  const admin = await browser.newPage();
  const recruiter = await browser.newPage();
  const candidate = await browser.newPage();
  try {
    await login(admin, process.env.E2E_ADMIN_EMAIL!, process.env.E2E_ADMIN_PASSWORD ?? "SyntheticAdmin!2026");
    await login(recruiter, "recruiter.demo@smart.local", "DemoRecruiter!2026");
    await login(candidate, "candidate.demo@smart.local", "DemoCandidate!2026");
    const adminId = await admin.evaluate(() => JSON.parse(sessionStorage.getItem("smart-recruitment.session")!).userId as string);
    const suffix = Date.now();
    const core = await call(admin, "/api/v2/dashboard/catalog", "POST", {
      kind: "INDUSTRY", name: `Synthetic audit industry ${suffix}`, reason: "Synthetic Core creation for audit"
    });
    const editReason = "Synthetic Core audit edit verified";
    await call(admin, `/api/v2/dashboard/catalog/${core.id}`, "PUT", {
      version: core.version, action: "EDIT", name: `${core.name} reviewed`, reason: editReason
    });
    const corePage = await call(admin, `/api/v2/dashboard/catalog/history?page=0&size=1&resourceId=${core.id}`);
    const coreSecond = await call(admin, `/api/v2/dashboard/catalog/history?page=1&size=1&resourceId=${core.id}`);
    expect(corePage).toMatchObject({ total: 2, page: 0, size: 1 });
    expect(corePage.items[0]).toMatchObject({ resourceId: core.id, actorUserId: adminId, action: "EDIT", reason: editReason });
    expect(coreSecond.items[0].action).toBe("CREATE");
    expect(corePage.items[0].id).not.toBe(coreSecond.items[0].id);

    const canonicalName = `SyntheticCandidate${suffix}X`;
    const term = `SyntheticCandidate${suffix}Y`;
    const initial = await call(admin, "/api/v2/taxonomy/skills");
    const canonical = await call(admin, "/api/v2/taxonomy/skills", "POST", {
      version: initial.version, action: "CREATE", name: canonicalName, type: "framework", category: "backend",
      aliases: [], relations: [], reason: "Synthetic audit review qa-audit@example.invalid"
    });
    const aiPage = await call(admin, `/api/v2/taxonomy/skills/history?page=0&size=20&resourceId=${canonical.skill.stableId}&action=CREATE`);
    expect(aiPage.total).toBe(1);
    const aiHistory = aiPage.items[0];
    expect(aiHistory).toMatchObject({ resourceId: canonical.skill.stableId, actorId: adminId, action: "CREATE", redacted: true });
    expect(aiHistory.reason).toContain("Synthetic audit review");
    expect(aiHistory.reason).not.toContain("qa-audit@example.invalid");
    expect(aiHistory.correlationId).toMatch(/^[0-9a-f-]{36}$/i);
    expect((await call(admin, `/api/v2/taxonomy/skills/history?resourceId=${core.id}`)).total).toBe(0);
    expect((await call(admin, `/api/v2/dashboard/catalog/history?resourceId=${canonical.skill.stableId}`)).total).toBe(0);
    await call(candidate, "/api/v2/dashboard/catalog/history", "GET", undefined, 403);
    await call(recruiter, "/api/v2/taxonomy/skills/history", "GET", undefined, 403);

    const companies = await call(recruiter, "/api/v2/companies");
    const job = await call(recruiter, `/api/v2/companies/${companies[0].companyId}/jobs`, "POST", {
      title: `Synthetic Java candidate role ${suffix}`, description: "Develop Java backend services and reliable integrations.",
      requirementsText: `Required: Java and ${term}.`, openings: 1, salaryNegotiable: false, externalAiConsent: false
    });
    await expect.poll(async () => (await recruiter.request.get(`/api/v2/parsed-jds/${job.jobVersionId}`,
      { headers: await headers(recruiter) })).status(), { timeout: 45_000 }).toBe(200);
    const parsed = await call(recruiter, `/api/v2/parsed-jds/${job.jobVersionId}`);
    parsed.payload.requirements.requiredSkills.push({ raw: term, canonicalSkillId: null, normalizationStatus: "PENDING",
      criticality: "CRITICAL", minimumMonths: null, evidenceIds: [], confidence: 1, confirmedByRecruiter: false });
    await call(recruiter, `/api/v2/parsed-jds/${job.jobVersionId}`, "PATCH", { expectedRevisionId: parsed.revisionId, payload: parsed.payload });
    const beforeRanking = await call(admin, "/api/v2/taxonomy/skills");
    const pending = beforeRanking.skills.find((entry: { canonicalName: string }) => entry.canonicalName === term);
    expect(pending.status).toBe("PENDING");
    const candidatePath = `/api/v2/taxonomy/pending-skills/${pending.stableId}/candidates`;
    const lexical = await call(admin, `${candidatePath}?semantic=false&limit=5`);
    expect(lexical).toMatchObject({ taxonomyVersion: beforeRanking.taxonomyVersion, resolution: "UNRESOLVED", requiresReview: true,
      semanticStatus: "DISABLED", algorithmVersion: "skill-candidate-ranking-v1", scorePolicy: "RANKING_ONLY_UNCALIBRATED",
      rankingMethod: "FUZZY_RATIO", fuzzyMethod: "SEQUENCE_MATCHER_RATIO_AUTOJUNK", modelId: null, modelRevision: null });
    expect(lexical.candidates[0].skillId).toBe(canonical.skill.stableId);
    expect(lexical.candidates[0].fuzzyScore).toBeGreaterThan(0.9);
    expect(lexical.candidates.every((item: { fuzzyScore: number; semanticScore: number | null }) =>
      item.fuzzyScore >= 0 && item.fuzzyScore <= 1 && item.semanticScore === null)).toBe(true);
    await call(candidate, `${candidatePath}?semantic=false`, "GET", undefined, 403);
    await call(recruiter, `${candidatePath}?semantic=false`, "GET", undefined, 403);

    await admin.getByRole("button", { name: "Kỹ năng / tên gọi khác" }).click();
    await expect(admin.getByRole("option", { name: `${term} · PENDING`, exact: true })).toHaveCount(1);
    await admin.getByLabel("Danh mục", { exact: true }).selectOption(pending.stableId);
    const suggestions = admin.getByRole("region", { name: "Gợi ý chuẩn hóa kỹ năng" });
    await expect(suggestions.getByText(canonicalName, { exact: true })).toBeVisible();
    await expect(suggestions).toContainText("Độ giống chữ");
    await expect(suggestions).toContainText("Cosine semantic");
    await expect(suggestions).toContainText("Chưa tính");
    await expect(suggestions.getByLabel("Tính thêm độ tương đồng semantic")).not.toBeChecked();
    await expect(admin.getByLabel("Tên", { exact: true })).toHaveValue(term);
    await expect(admin.getByLabel("Gộp vào danh mục đã có", { exact: true })).toHaveValue("");
    await admin.getByLabel("Lý do thay đổi").fill("Synthetic ranking reviewed without applying changes");
    const semanticResponse = admin.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === candidatePath && url.searchParams.get("semantic") === "true";
    });
    await suggestions.getByLabel("Tính thêm độ tương đồng semantic").check();
    const semanticHttp = await semanticResponse;
    expect(semanticHttp.status()).toBe(200);
    const semantic = await semanticHttp.json();
    expect(["AVAILABLE", "MODEL_UNAVAILABLE", "EMBEDDING_FAILED", "INPUT_LIMIT"]).toContain(semantic.semanticStatus);
    if (semantic.semanticStatus === "AVAILABLE") {
      expect(semantic.rankingMethod).toBe("SEMANTIC_COSINE");
      expect(semantic.candidates.every((item: { semanticScore: number }) => item.semanticScore >= -1 && item.semanticScore <= 1)).toBe(true);
      await expect(suggestions).toContainText("Semantic đã tính bằng mô hình cục bộ");
    } else {
      expect(semantic.rankingMethod).toBe("FUZZY_RATIO");
      expect(semantic.candidates).toEqual(lexical.candidates);
      await expect(suggestions).toContainText("Gợi ý so chữ vẫn dùng được");
    }
    expect(await call(admin, "/api/v2/taxonomy/skills")).toEqual(beforeRanking);
    await expect(admin.getByLabel("Tên", { exact: true })).toHaveValue(term);
    await expect(admin.getByLabel("Gộp vào danh mục đã có", { exact: true })).toHaveValue("");
    await expect(admin.getByLabel("Lý do thay đổi")).toHaveValue("Synthetic ranking reviewed without applying changes");

    await admin.getByRole("button", { name: "Nhật ký thay đổi", exact: true }).click();
    const audit = admin.getByRole("region", { name: "Tra cứu nhật ký" });
    await audit.getByLabel("ID người thực hiện", { exact: true }).fill(adminId);
    await audit.getByLabel("ID danh mục / kỹ năng", { exact: true }).fill(core.id);
    await audit.getByLabel("Hành động nhật ký", { exact: true }).selectOption("EDIT");
    await audit.getByLabel("Mã tương quan nhật ký", { exact: true }).fill(corePage.items[0].correlationId);
    const timeBounds = await admin.evaluate((timestamp: string) => {
      const local = (epoch: number) => {
        const date = new Date(epoch); const pad = (value: number) => String(value).padStart(2, "0");
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
      };
      const time = new Date(timestamp).getTime(); return [local(time - 3_600_000), local(time + 3_600_000)];
    }, corePage.items[0].occurredAt);
    await audit.getByLabel("Thời gian từ (giờ địa phương)", { exact: true }).fill(timeBounds[0]);
    await audit.getByLabel("Thời gian đến (giờ địa phương)", { exact: true }).fill(timeBounds[1]);
    await audit.getByRole("button", { name: "Tìm nhật ký", exact: true }).click();
    await expect(audit).toContainText("1 thay đổi · Trang 1 · Danh mục nghề (Core)");
    await expect(audit).toContainText(editReason);
    await expect(audit).toContainText(corePage.items[0].correlationId);
    await expect(audit.getByRole("listitem")).toHaveCount(1);
    await expect(audit.getByRole("button", { name: "Trang nhật ký sau" })).toBeDisabled();
    await audit.getByLabel("Nguồn nhật ký", { exact: true }).selectOption("AI");
    await expect(audit.getByLabel("ID người thực hiện", { exact: true })).toHaveValue("");
    await expect(audit.getByLabel("ID danh mục / kỹ năng", { exact: true })).toHaveValue("");
    await audit.getByLabel("ID người thực hiện", { exact: true }).fill(adminId);
    await audit.getByLabel("ID danh mục / kỹ năng", { exact: true }).fill(canonical.skill.stableId);
    await audit.getByLabel("Hành động nhật ký", { exact: true }).selectOption("CREATE");
    await audit.getByLabel("Mã tương quan nhật ký", { exact: true }).fill(aiHistory.correlationId);
    await audit.getByRole("button", { name: "Tìm nhật ký", exact: true }).click();
    await expect(audit).toContainText("1 thay đổi · Trang 1 · Kỹ năng (AI)");
    await expect(audit).toContainText("Thông tin liên hệ đã được che trong bản ghi này");
    await expect(audit).toContainText(aiHistory.reason);
    await expect(audit).not.toContainText("qa-audit@example.invalid");
    await expect(audit).not.toContainText(editReason);
    await expect(audit.getByRole("listitem")).toHaveCount(1);
    await expect(audit.getByRole("link")).toHaveCount(0);
  } finally { await admin.close(); await recruiter.close(); await candidate.close(); }
});

test("real CV access is revoked per application, withdrawal revokes its grant and deletion erases analysis", async ({ browser }) => {
  test.setTimeout(120_000);
  const candidate = await browser.newPage();
  const recruiter = await browser.newPage();
  await login(candidate, "candidate.demo@smart.local", "DemoCandidate!2026");
  await login(recruiter, "recruiter.demo@smart.local", "DemoRecruiter!2026");
  await call(candidate, "/api/v2/dashboard/catalog", "GET", undefined, 403);
  await call(candidate, "/api/v2/taxonomy/skills", "GET", undefined, 403);
  const title = `Synthetic privacy CV ${Date.now()}`;
  const upload = await candidate.request.post("/api/v2/cvs", { headers: await headers(candidate), multipart: {
    title, file: { name: "synthetic.pdf", mimeType: "application/pdf", buffer: readFileSync(path.resolve("e2e/fixtures/job-scoped-skills-cv.pdf")) }
  }});
  expect(upload.status()).toBe(201);
  const cv = await upload.json();
  const versionId = cv.activeVersion.cvVersionId;
  await expect.poll(async () => (await candidate.request.get(`/api/v2/parsed-cvs/${versionId}`, { headers: await headers(candidate) })).status(), { timeout: 30_000 }).toBe(200);
  const parsed = await call(candidate, `/api/v2/parsed-cvs/${versionId}`);
  await call(candidate, `/api/v2/parsed-cvs/${versionId}/confirm`, "POST", { expectedRevisionId: parsed.revisionId });
  await expect.poll(async () => (await call(candidate, "/api/v2/cvs")).find((item: { cvId: string }) => item.cvId === cv.cvId)?.activeVersion.processingStatus).toBe("CONFIRMED");
  const companies = await call(recruiter, "/api/v2/companies");
  const applications = [];
  for (let index = 0; index < 3; index++) {
    const job = await call(recruiter, `/api/v2/companies/${companies[0].companyId}/jobs`, "POST", {
      title: `Synthetic privacy job ${Date.now()} ${index}`, description: "Synthetic manual job", requirementsText: "Synthetic requirements", openings: 1, salaryNegotiable: false, externalAiConsent: false,
      category: { industryName: "Synthetic privacy industry", specializationName: "Synthetic manual group", positionName: `Synthetic role ${index}` }
    });
    await call(recruiter, `/api/v2/jobs/${job.jobId}/publish?version=${job.version}`, "POST");
    const application = await call(candidate, "/api/v2/candidate/applications", "POST", {
      jobId: job.jobId, cvId: cv.cvId, cvVersionId: versionId, consentAccepted: true, policyVersion: "cv-sharing-v1"
    }, 201);
    expect(application.matchingSupported).toBe(false);
    expect(application.cvAccessGranted).toBe(true);
    applications.push(application);
    expect((await recruiter.request.get(`/api/v2/recruiter/applications/${application.applicationId}/cv`, { headers: await headers(recruiter) })).status()).toBe(200);
  }
  await call(candidate, `/api/v2/candidate/applications/${applications[0].applicationId}/cv-access?version=0`, "DELETE", undefined, 204);
  expect((await recruiter.request.get(`/api/v2/recruiter/applications/${applications[0].applicationId}/cv`, { headers: await headers(recruiter) })).status()).toBe(404);
  expect((await recruiter.request.get(`/api/v2/recruiter/applications/${applications[1].applicationId}/cv`, { headers: await headers(recruiter) })).status()).toBe(200);
  const withdrawn = await call(candidate, `/api/v2/candidate/applications/${applications[1].applicationId}/withdraw`, "POST", { version: 0, reason: "Synthetic test withdrawal" });
  expect(withdrawn.status).toBe("WITHDRAWN");
  expect(withdrawn.cvAccessGranted).toBe(false);
  expect((await recruiter.request.get(`/api/v2/recruiter/applications/${applications[1].applicationId}/cv`, { headers: await headers(recruiter) })).status()).toBe(404);
  await candidate.reload();
  await candidate.getByRole("button", { name: "CV của tôi", exact: true }).click();
  const card = candidate.locator(".cv-item").filter({ hasText: title });
  await card.getByRole("button", { name: "Xóa CV", exact: true }).click();
  await expect(candidate.getByRole("dialog", { name: "Xóa CV" })).toBeVisible();
  await candidate.getByRole("button", { name: "Xác nhận xóa CV" }).click();
  await expect(card).toHaveCount(0);
  expect((await recruiter.request.get(`/api/v2/recruiter/applications/${applications[2].applicationId}/cv`, { headers: await headers(recruiter) })).status()).toBe(404);
  await expect.poll(async () => (await candidate.request.get(`/api/v2/parsed-cvs/${versionId}`, { headers: await headers(candidate) })).status(), { timeout: 30_000 }).toBe(410);
  const history = await call(candidate, `/api/v2/applications/${applications[1].applicationId}/history`);
  expect(history.length).toBeGreaterThan(0);
  await candidate.close(); await recruiter.close();
});
