import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CategoryEntry } from "../recruiter/JobCategoryFields";
import { CategoryTree } from "./CategoryTree";

const categories: CategoryEntry[] = [
  { id: "ind-it", kind: "INDUSTRY", parentId: null, name: "IT", status: "ACTIVE", version: 1 },
  { id: "spec-be", kind: "SPECIALIZATION", parentId: "ind-it", name: "Backend", status: "ACTIVE", version: 1 },
  { id: "pos-java", kind: "POSITION", parentId: "spec-be", name: "Java Dev", status: "PENDING", version: 1 },
  { id: "pos-go", kind: "POSITION", parentId: "spec-be", name: "Go Dev", status: "ACTIVE", version: 1 },
  { id: "ind-acc", kind: "INDUSTRY", parentId: null, name: "Kế toán", status: "ACTIVE", version: 1 },
  { id: "pos-orphan", kind: "POSITION", parentId: "missing", name: "Orphan", status: "ACTIVE", version: 1 }
];

function renderTree(overrides: Partial<Parameters<typeof CategoryTree>[0]> = {}) {
  const onOpen = overrides.onOpen ?? vi.fn();
  const onCreateChild = overrides.onCreateChild ?? vi.fn();
  return {
    onOpen,
    onCreateChild,
    ...render(
      <CategoryTree
        categories={categories}
        matches={() => true}
        hasFilter={false}
        selected=""
        disabled={false}
        onOpen={onOpen}
        onCreateChild={onCreateChild}
        {...overrides}
      />
    )
  };
}

describe("CategoryTree", () => {
  it("expands branches with pending items by default and shows pending counts", () => {
    renderTree();

    expect(screen.getByRole("button", { name: "Thu gọn IT" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Backend" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Java Dev" })).toBeInTheDocument();

    const itRow = screen.getByRole("button", { name: "IT" }).closest("tr");
    expect(itRow).not.toBeNull();
    expect(within(itRow!).getByText("1 chờ duyệt")).toBeInTheDocument();
  });

  it("toggles branch expansion when clicking the collapse/expand button", () => {
    renderTree();

    fireEvent.click(screen.getByRole("button", { name: "Thu gọn IT" }));
    expect(screen.queryByRole("button", { name: "Backend" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Java Dev" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Mở rộng IT" }));
    expect(screen.getByRole("button", { name: "Backend" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Java Dev" })).toBeInTheDocument();
  });

  it("supports collapsing and expanding all branches from the toolbar", () => {
    renderTree();

    fireEvent.click(screen.getByRole("button", { name: "Thu gọn tất cả" }));
    expect(screen.queryByRole("button", { name: "Backend" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Java Dev" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Mở rộng tất cả" }));
    expect(screen.getByRole("button", { name: "Backend" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Java Dev" })).toBeInTheDocument();
  });

  it("shows non-matching ancestors as static context while hiding non-matching items and branches", () => {
    renderTree({
      matches: (entry) => entry.name === "Go Dev",
      hasFilter: true
    });

    expect(screen.getByText("IT")).toBeInTheDocument();
    expect(screen.getByText("Backend")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "IT" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Backend" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go Dev" })).toBeInTheDocument();
    expect(screen.queryByText("Java Dev")).not.toBeInTheDocument();
    expect(screen.queryByText("Kế toán")).not.toBeInTheDocument();
  });

  it("groups categories with missing parents under Chưa phân nhóm", () => {
    renderTree();

    const rows = screen.getAllByRole("row");
    const groupIdx = rows.findIndex((row) => within(row).queryByText("Chưa phân nhóm"));
    const orphanIdx = rows.findIndex((row) => within(row).queryByRole("button", { name: "Orphan" }));

    expect(groupIdx).toBeGreaterThan(0);
    expect(orphanIdx).toBe(groupIdx + 1);
    expect(within(rows[groupIdx]).queryByRole("button")).not.toBeInTheDocument();
  });

  it("triggers onCreateChild and onOpen callbacks from tree rows", () => {
    const { onOpen, onCreateChild } = renderTree();

    fireEvent.click(screen.getByRole("button", { name: "Thêm vị trí vào Backend" }));
    expect(onCreateChild).toHaveBeenCalledWith("POSITION", "spec-be");

    fireEvent.click(screen.getByRole("button", { name: "Java Dev" }));
    expect(onOpen).toHaveBeenCalledWith("pos-java");
  });
});
