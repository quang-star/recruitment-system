import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceShell } from "./WorkspaceShell";

function renderSidebarShell({
  onLogout = vi.fn(),
  onSelectProfile = vi.fn(),
  onSelectSecurity = vi.fn()
}: {
  onLogout?: () => void;
  onSelectProfile?: () => void;
  onSelectSecurity?: () => void;
} = {}) {
  return render(
    <WorkspaceShell
      variant="recruiter"
      activeItem="dashboard"
      brandLabel="Recruiter ATS"
      userLabel="Demo Recruiter"
      accountRoleLabel="Nhà tuyển dụng"
      navItems={[{ id: "dashboard", label: "Tổng quan", icon: <span aria-hidden="true">D</span> }]}
      accountMenuItems={[
        { id: "profile", label: "Hồ sơ recruiter", icon: <span aria-hidden="true">P</span>, onSelect: onSelectProfile },
        { id: "security", label: "Bảo mật tài khoản", icon: <span aria-hidden="true">S</span>, onSelect: onSelectSecurity }
      ]}
      onNavigate={vi.fn()}
      onLogout={onLogout}
    >
      <div>Nội dung</div>
    </WorkspaceShell>
  );
}

describe("WorkspaceShell sidebar account menu", () => {
  it("renders only the Tài khoản trigger button collapsed by default", () => {
    renderSidebarShell();

    const trigger = screen.getByRole("button", { name: "Tài khoản" });
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Đăng xuất" })).not.toBeInTheDocument();
    expect(screen.queryByText("Demo Recruiter")).not.toBeInTheDocument();
  });

  it("opens the account popover on click and invokes account items and logout", () => {
    const onLogout = vi.fn();
    const onSelectProfile = vi.fn();
    renderSidebarShell({ onLogout, onSelectProfile });

    const trigger = screen.getByRole("button", { name: "Tài khoản" });
    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Demo Recruiter")).toBeInTheDocument();
    expect(screen.getByText("Nhà tuyển dụng")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Menu tài khoản" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Hồ sơ recruiter" }));
    expect(onSelectProfile).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Đăng xuất" })).not.toBeInTheDocument();

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Đăng xuất" }));
    expect(onLogout).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Đăng xuất" })).not.toBeInTheDocument();
  });

  it("closes the popover on Escape and outside pointerdown", () => {
    renderSidebarShell();

    const trigger = screen.getByRole("button", { name: "Tài khoản" });
    fireEvent.click(trigger);
    expect(screen.getByRole("button", { name: "Đăng xuất" })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("button", { name: "Đăng xuất" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    fireEvent.click(trigger);
    expect(screen.getByRole("button", { name: "Đăng xuất" })).toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("button", { name: "Đăng xuất" })).not.toBeInTheDocument();
  });

  it("renders the unified BrandMark wordmark alongside the workspace label", () => {
    const { container } = renderSidebarShell();

    expect(container.querySelector("img")).toHaveAttribute("src", "/logo.png");
    expect(container.querySelector("strong")).toHaveTextContent("Jobs.");
    expect(screen.getByText("Recruiter ATS")).toBeInTheDocument();
  });
});
