import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PageControls } from "./PageControls";

describe("PageControls", () => {
  it("renders numbered pages, active state, and prev/next navigation", () => {
    const onPageChange = vi.fn();
    render(
      <PageControls
        page={1}
        size={10}
        total={45}
        loading={false}
        onPageChange={onPageChange}
        label="Phân trang thử nghiệm"
      />
    );

    const nav = screen.getByRole("navigation", { name: "Phân trang thử nghiệm" });
    expect(nav).toHaveTextContent("Trang 2/5 · 45 kết quả");

    const active = screen.getByRole("button", { name: "Trang 2" });
    expect(active).toHaveAttribute("aria-current", "page");

    fireEvent.click(active);
    expect(onPageChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Trang 4" }));
    expect(onPageChange).toHaveBeenCalledWith(3);

    fireEvent.click(screen.getByRole("button", { name: "Trang trước" }));
    expect(onPageChange).toHaveBeenCalledWith(0);

    fireEvent.click(screen.getByRole("button", { name: "Trang sau" }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("collapses large page ranges with ellipsis around the current page", () => {
    render(
      <PageControls
        page={5}
        size={10}
        total={120}
        loading={false}
        onPageChange={vi.fn()}
        label="Phân trang nhiều trang"
      />
    );

    expect(screen.getByRole("button", { name: "Trang 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Trang 5" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Trang 6" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Trang 7" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Trang 12" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Trang 3" })).not.toBeInTheDocument();
    expect(screen.getAllByText("…")).toHaveLength(2);
  });

  it("hides pagination controls when there is only one page", () => {
    const { container } = render(
      <PageControls
        page={0}
        size={10}
        total={10}
        loading={false}
        onPageChange={vi.fn()}
        label="Phân trang một trang"
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("disables controls and shows loading status while loading", () => {
    render(
      <PageControls
        page={0}
        size={10}
        total={30}
        loading={true}
        onPageChange={vi.fn()}
        label="Phân trang đang tải"
      />
    );

    expect(screen.getByText("Đang tải…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Trang trước" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Trang sau" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Trang 1" })).toBeDisabled();
  });
});
