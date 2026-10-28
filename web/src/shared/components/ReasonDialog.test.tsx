import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { ReasonDialog } from "./ReasonDialog";

function Example({ onConfirm = () => {} }: { onConfirm?: (reason: string) => void }) {
  const [open, setOpen] = useState(false);
  return <><button onClick={() => setOpen(true)}>Mở xác nhận</button>
    <ReasonDialog open={open} title="Rút hồ sơ" description="Xác nhận lý do" confirmLabel="Xác nhận"
      onCancel={() => setOpen(false)} onConfirm={onConfirm} /></>;
}

it("keeps keyboard focus inside the dialog and restores it after Escape", async () => {
  const user = userEvent.setup();
  render(<Example />);
  const trigger = screen.getByRole("button", { name: "Mở xác nhận" });
  await user.click(trigger);
  expect(screen.getByRole("textbox", { name: "Lý do" })).toHaveFocus();
  await user.type(screen.getByRole("textbox"), "Đã nhận công việc khác");
  screen.getByRole("button", { name: "Xác nhận" }).focus();
  await user.tab();
  expect(screen.getByRole("button", { name: "Đóng" })).toHaveFocus();
  await user.tab({ shift: true });
  expect(screen.getByRole("button", { name: "Xác nhận" })).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  expect(document.body.style.overflow).not.toBe("hidden");
});

it("rejects whitespace-only reasons and clears the previous reason on reopening", async () => {
  const confirm = vi.fn();
  const user = userEvent.setup();
  render(<Example onConfirm={confirm} />);
  await user.click(screen.getByText("Mở xác nhận"));
  await user.type(screen.getByRole("textbox"), "   ");
  fireEvent.submit(screen.getByRole("textbox").closest("form")!);
  expect(confirm).not.toHaveBeenCalled();
  await user.clear(screen.getByRole("textbox"));
  await user.type(screen.getByRole("textbox"), "Lý do trước");
  await user.keyboard("{Escape}");
  await user.click(screen.getByText("Mở xác nhận"));
  expect(screen.getByRole("textbox")).toHaveValue("");
});
