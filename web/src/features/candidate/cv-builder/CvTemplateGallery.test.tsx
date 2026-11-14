import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AuthSession } from "../../../shared/auth/session";
import { BODY_SECTIONS, type CvDraftRecord } from "./cvDocument";
import { CvTemplateGallery } from "./CvTemplateGallery";
import { CvTemplatePreviewModal } from "./CvTemplatePreviewModal";

const session = { userId: "100", accessToken: "synthetic-test" } as AuthSession;

describe("TopCV-style template gallery and preview modal", () => {
  it("filters templates by tag and passes chosen swatch color on selection", () => {
    const onSelectTemplate = vi.fn();
    render(<CvTemplateGallery onSelectTemplate={onSelectTemplate} />);

    fireEvent.click(screen.getByRole("button", { name: "Hai cột" }));
    expect(screen.getByRole("button", { name: "Xem trước mẫu Hiện Đại · Modern" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Xem trước mẫu Senior · Classic" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Chọn màu Đỏ rượu cho mẫu Hiện Đại · Modern" }));
    fireEvent.click(screen.getByRole("button", { name: "Xem trước mẫu Hiện Đại · Modern" }));
    expect(onSelectTemplate).toHaveBeenCalledWith("modern", "#9f1239");
  });

  it("lets user preview template, switch color, and choose sample, existing draft, or blank source", () => {
    const onCreate = vi.fn();
    const serverDraft: CvDraftRecord = {
      draftId: "9007199254740993",
      candidateUserId: "100",
      title: "Bản nháp cũ",
      templateId: "classic",
      accentColor: "#334155",
      sectionOrder: [...BODY_SECTIONS],
      payload: {
        fullName: "Trần Thu Hà",
        headline: "QA Engineer",
        email: "",
        phone: "",
        location: "",
        links: "",
        introduction: "",
        skills: "Playwright",
        experiences: [],
        education: [],
        projects: [],
        certificates: [],
        languages: [],
      },
      createdAt: "2026-11-14T00:00:00Z",
      updatedAt: "2026-11-14T00:00:00Z",
      version: 0,
    };

    render(
      <CvTemplatePreviewModal
        open={true}
        templateId="modern"
        initialAccentColor="#0f766e"
        session={session}
        cvs={[]}
        serverDrafts={[serverDraft]}
        onClose={vi.fn()}
        onCreate={onCreate}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Xem thử màu Lục bảo" }));
    fireEvent.click(screen.getByRole("radio", { name: /Nội dung CV đã tạo trước đó/ }));
    fireEvent.click(screen.getByRole("button", { name: "Tạo CV" }));

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        templateId: "modern",
        accentColor: "#047857",
        fullName: "Trần Thu Hà",
        skills: "Playwright",
      }),
    );

    fireEvent.click(screen.getByRole("radio", { name: /Tạo CV từ đầu/ }));
    fireEvent.click(screen.getByRole("button", { name: "Tạo CV" }));
    expect(onCreate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        templateId: "modern",
        accentColor: "#047857",
        fullName: "",
        skills: "",
      }),
    );
  });
});
