import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LoginPage } from "./LoginPage";

describe("LoginPage account recovery", () => {
  it("submits a generic forgot-password request without exposing account existence", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      JSON.stringify({ message: "If the account is eligible, an email will be sent with the next steps" }),
      { status: 202, headers: { "Content-Type": "application/json" } }
    ));
    const user = userEvent.setup();
    render(<LoginPage onSuccess={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Quên mật khẩu?" }));
    await user.type(screen.getByLabelText("Email"), "candidate@example.com");
    await user.click(screen.getByRole("button", { name: "Gửi hướng dẫn" }));

    expect(await screen.findByText(/Nếu tài khoản hợp lệ/)).toBeInTheDocument();
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/api/v1/auth/forgot-password");
    expect(JSON.parse(String(init?.body))).toEqual({ email: "candidate@example.com" });
  });

  it("requests a new verification email from the login form", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      JSON.stringify({ message: "accepted" }),
      { status: 202, headers: { "Content-Type": "application/json" } }
    ));
    const user = userEvent.setup();
    render(<LoginPage onSuccess={vi.fn()} />);

    await user.type(screen.getByLabelText("Email"), "pending@example.com");
    await user.click(screen.getByRole("button", { name: "Gửi lại email xác minh" }));

    expect(await screen.findByText(/đang chờ xác minh/)).toBeInTheDocument();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/auth/resend-verification");
  });
});
