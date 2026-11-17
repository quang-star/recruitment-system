import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CandidateAccountMenu } from "./CandidateAccountMenu";

describe("CandidateAccountMenu", () => {
  it("renders personal info trigger with candidate name and avatar", () => {
    render(<CandidateAccountMenu name="Trần Văn A" onNavigate={vi.fn()} onLogout={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Tài khoản Trần Văn A" })).toBeInTheDocument();
    expect(screen.getByText("T")).toBeInTheDocument();
    expect(screen.getByText("Trần Văn A")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Tài khoản cá nhân" })).not.toBeInTheDocument();
  });

  it("opens menu on mouse hover (mouseenter) with all required candidate links", async () => {
    render(<CandidateAccountMenu name="Trần Văn A" onNavigate={vi.fn()} onLogout={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: "Tài khoản Trần Văn A" });
    const container = trigger.closest(".portal-account")!;

    fireEvent.mouseEnter(container);

    const nav = screen.getByRole("navigation", { name: "Tài khoản cá nhân" });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tổng quan" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hồ sơ" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "CV của tôi" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Việc làm đã ứng tuyển" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bảo mật" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Đăng xuất" })).toBeInTheDocument();
  });

  it("navigates to the selected candidate section on click", async () => {
    const onNavigate = vi.fn();
    render(<CandidateAccountMenu name="Trần Văn A" onNavigate={onNavigate} onLogout={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: "Tài khoản Trần Văn A" });
    fireEvent.click(trigger);

    fireEvent.click(screen.getByRole("button", { name: "Việc làm đã ứng tuyển" }));
    expect(onNavigate).toHaveBeenCalledWith("applications");
    expect(screen.queryByRole("navigation", { name: "Tài khoản cá nhân" })).not.toBeInTheDocument();
  });

  it("triggers logout when clicking Đăng xuất", async () => {
    const onLogout = vi.fn();
    render(<CandidateAccountMenu name="Trần Văn A" onNavigate={vi.fn()} onLogout={onLogout} />);
    const trigger = screen.getByRole("button", { name: "Tài khoản Trần Văn A" });
    fireEvent.click(trigger);

    fireEvent.click(screen.getByRole("button", { name: "Đăng xuất" }));
    expect(onLogout).toHaveBeenCalledOnce();
  });

  it("closes after mouse leave with slight delay", async () => {
    render(<CandidateAccountMenu name="Trần Văn A" onNavigate={vi.fn()} onLogout={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: "Tài khoản Trần Văn A" });
    const container = trigger.closest(".portal-account")!;

    fireEvent.mouseEnter(container);
    expect(screen.getByRole("navigation", { name: "Tài khoản cá nhân" })).toBeInTheDocument();

    fireEvent.mouseLeave(container);
    await waitFor(() => {
      expect(screen.queryByRole("navigation", { name: "Tài khoản cá nhân" })).not.toBeInTheDocument();
    }, { timeout: 500 });
  });
});
