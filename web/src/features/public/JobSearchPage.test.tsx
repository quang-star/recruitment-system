import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { apiRequest } from "../../shared/api/client";
import { JobSearchPage } from "./JobSearchPage";
import { JobDiscovery, PublicJob } from "./types";

vi.mock("../../shared/api/client", () => ({ apiRequest: vi.fn() }));
const discovery: JobDiscovery = { locations: ["Hà Nội"], categories: [
  { industryId: "1", specializationId: "3", name: "Phát triển web", jobCount: 13 }
] };
const job: PublicJob = { jobId: "42", companyId: "10", title: "Java Engineer", description: "API", requirementsText: "Java",
  benefitsText: null, locationText: "Hà Nội", workMode: "REMOTE", employmentType: "FULL_TIME", seniorityLevel: "Junior",
  openings: 1, salaryMin: 20000000, salaryMax: 30000000, salaryCurrency: "VND", salaryNegotiable: false };
beforeEach(() => {
  vi.mocked(apiRequest).mockReset();
  vi.mocked(apiRequest).mockResolvedValue({ items: [job], total: 13, page: 0, size: 12 });
  Element.prototype.scrollIntoView = vi.fn();
});

it("combines API category identities, salary, location, work mode and paging without a detail preview", async () => {
  render(<JobSearchPage discovery={discovery} onSelectJob={vi.fn()} />);
  await screen.findByRole("link", { name: /Java Engineer/ });
  fireEvent.change(screen.getByLabelText("Lọc theo nhóm nghề"), { target: { value: "1:3" } });
  fireEvent.change(screen.getByLabelText("Lọc theo mức lương"), { target: { value: "15_30" } });
  fireEvent.change(screen.getByLabelText("Địa điểm"), { target: { value: "Hà Nội" } });
  fireEvent.change(screen.getByLabelText("Lọc theo chế độ làm việc"), { target: { value: "REMOTE" } });
  await screen.findByRole("link", { name: /Java Engineer/ });
  fireEvent.click(screen.getByRole("button", { name: "Trang sau" }));
  await waitFor(() => expect(vi.mocked(apiRequest).mock.calls.some(([path]) => {
    const params = new URL(path, "http://test").searchParams;
    return params.get("industryId") === "1" && params.get("specializationId") === "3" && params.get("page") === "1"
      && params.get("minSalary") === "15000000" && params.get("maxSalary") === "30000000"
      && params.get("location") === "Hà Nội" && params.get("workMode") === "REMOTE";
  })).toBe(true));
  expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Ứng tuyển/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Xóa bộ lọc" }));
  expect(new URLSearchParams(window.location.search).has("page")).toBe(false);
});

it("retains query parameters in shareable job links and retries failed searches", async () => {
  window.history.replaceState(null, "", "/?view=search&q=Java&mode=REMOTE");
  vi.mocked(apiRequest).mockRejectedValueOnce(new Error("Unavailable"));
  const onSelectJob = vi.fn();
  render(<JobSearchPage discovery={discovery} onSelectJob={onSelectJob} />);
  await screen.findByRole("alert");
  expect(screen.queryByText("Chưa tìm thấy việc làm phù hợp")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
  const link = await screen.findByRole("link", { name: /Java Engineer/ });
  const params = new URL(link.getAttribute("href")!, "http://test").searchParams;
  expect(params.get("q")).toBe("Java"); expect(params.get("mode")).toBe("REMOTE"); expect(params.get("job")).toBe("42");
  fireEvent.click(link);
  expect(onSelectJob).toHaveBeenCalledWith(job);
});
