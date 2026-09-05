import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ResetPasswordPage } from "./ResetPasswordPage";

describe("ResetPasswordPage", () => {
  afterEach(() => window.history.replaceState({}, "", "/"));

  it("validates confirmation locally then submits the reset token", async () => {
    const token = "t".repeat(64);
    window.history.replaceState({}, "", `/reset-password?token=${token}`);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
    const user = userEvent.setup();
    render(<ResetPasswordPage />);

    await user.type(screen.getByLabelText("Mật khẩu mới"), "NewPassword!2026");
    await user.type(screen.getByLabelText("Nhập lại mật khẩu"), "Different!2026");
    await user.click(screen.getByRole("button", { name: "Đặt lại mật khẩu" }));
    expect(await screen.findByText("Hai mật khẩu chưa trùng khớp.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText("Nhập lại mật khẩu"));
    await user.type(screen.getByLabelText("Nhập lại mật khẩu"), "NewPassword!2026");
    await user.click(screen.getByRole("button", { name: "Đặt lại mật khẩu" }));

    expect(await screen.findByText(/Tất cả phiên đăng nhập cũ/)).toBeInTheDocument();
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/api/v1/auth/reset-password");
    expect(JSON.parse(String(init?.body))).toEqual({ token, newPassword: "NewPassword!2026" });
  });
});
