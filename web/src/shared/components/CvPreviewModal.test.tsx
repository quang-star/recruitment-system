import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CvPreviewModal } from "./CvPreviewModal";
import * as client from "../api/client";

vi.mock("../api/client", () => ({
  apiDownload: vi.fn(),
}));

describe("CvPreviewModal", () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  beforeEach(() => {
    vi.clearAllMocks();
    URL.createObjectURL = vi.fn(() => "blob:http://localhost/mock-blob-uuid");
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it("does not render when open is false", () => {
    render(
      <CvPreviewModal
        open={false}
        onClose={vi.fn()}
        downloadPath="/api/v2/cvs/123/file"
        accessToken="mock-token"
      />
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders loading state and displays iframe upon successful download", async () => {
    const mockBlob = new Blob(["mock-pdf-content"], { type: "application/pdf" });
    vi.mocked(client.apiDownload).mockResolvedValueOnce({
      blob: mockBlob,
      filename: "server-cv.pdf",
    });

    render(
      <CvPreviewModal
        open={true}
        onClose={vi.fn()}
        title="CV của Nguyễn Văn A"
        filename="custom-filename.pdf"
        downloadPath="/api/v2/cvs/123/file"
        accessToken="mock-token"
      />
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("CV của Nguyễn Văn A")).toBeInTheDocument();
    expect(screen.getByText("custom-filename.pdf")).toBeInTheDocument();
    expect(screen.getByText("Đang tải tài liệu PDF…")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByText("Đang tải tài liệu PDF…")).not.toBeInTheDocument();
    });

    const iframe = screen.getByTitle("Xem trước CV: custom-filename.pdf") as HTMLIFrameElement;
    expect(iframe).toBeInTheDocument();
    expect(iframe.src).toContain("blob:http://localhost/mock-blob-uuid");

    // Check actions
    const openTabLink = screen.getByRole("link", { name: /Mở tab mới/i });
    expect(openTabLink).toHaveAttribute("href", "blob:http://localhost/mock-blob-uuid");
    expect(openTabLink).toHaveAttribute("target", "_blank");

    const downloadLink = screen.getByRole("link", { name: /Tải về máy/i });
    expect(downloadLink).toHaveAttribute("href", "blob:http://localhost/mock-blob-uuid");
    expect(downloadLink).toHaveAttribute("download", "custom-filename.pdf");
  });

  it("handles download failure and retries on button click", async () => {
    vi.mocked(client.apiDownload)
      .mockRejectedValueOnce(new Error("Không thể tải tệp từ máy chủ"))
      .mockResolvedValueOnce({
        blob: new Blob(["retry-pdf"], { type: "application/pdf" }),
        filename: "cv-retry.pdf",
      });

    render(
      <CvPreviewModal
        open={true}
        onClose={vi.fn()}
        downloadPath="/api/v2/cvs/123/file"
        accessToken="mock-token"
      />
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText("Không thể tải tệp từ máy chủ")).toBeInTheDocument();
    });

    const retryBtn = screen.getByRole("button", { name: "Thử lại" });
    fireEvent.click(retryBtn);

    expect(screen.getByText("Đang tải tài liệu PDF…")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.getByTitle(/Xem trước CV/i)).toBeInTheDocument();
    });
  });

  it("calls onClose when close button is clicked or Escape is pressed", async () => {
    const handleClose = vi.fn();
    const user = userEvent.setup();

    vi.mocked(client.apiDownload).mockReturnValue(new Promise(() => {})); // pending

    render(
      <CvPreviewModal
        open={true}
        onClose={handleClose}
        downloadPath="/api/v2/cvs/123/file"
        accessToken="mock-token"
      />
    );

    const closeBtn = screen.getByRole("button", { name: "Đóng cửa sổ xem trước" });
    await user.click(closeBtn);
    expect(handleClose).toHaveBeenCalledTimes(1);

    await user.keyboard("{Escape}");
    expect(handleClose).toHaveBeenCalledTimes(2);
  });

  it("revokes object URL on unmount", async () => {
    const mockBlob = new Blob(["mock-pdf"], { type: "application/pdf" });
    vi.mocked(client.apiDownload).mockResolvedValueOnce({
      blob: mockBlob,
      filename: "test.pdf",
    });

    const { unmount } = render(
      <CvPreviewModal
        open={true}
        onClose={vi.fn()}
        downloadPath="/api/v2/cvs/123/file"
        accessToken="mock-token"
      />
    );

    await waitFor(() => {
      expect(screen.getByTitle(/Xem trước CV/i)).toBeInTheDocument();
    });

    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:http://localhost/mock-blob-uuid");
  });
});
