import { FormEvent, useEffect, useState } from "react";
import { Button, Modal } from "../ui";

type ReasonDialogProps = {
  confirmLabel: string;
  description: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
  open: boolean;
  title: string;
};

export function ReasonDialog({ confirmLabel, description, onCancel, onConfirm, open, title }: ReasonDialogProps) {
  const [reason, setReason] = useState("");
  useEffect(() => { if (open) setReason(""); }, [open]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reason.trim()) onConfirm(reason.trim());
  }

  return (
    <Modal
      open={open}
      onClose={onCancel}
      eyebrow="Xác nhận thao tác"
      title={title}
      description={description}
      titleId="reason-dialog-title"
      size="sm"
    >
      <form onSubmit={submit} className="pt-4 space-y-4">
        <label className="block space-y-1.5 text-sm font-medium text-ink-800">
          <span>Lý do</span>
          <textarea
            data-modal-autofocus
            rows={4}
            maxLength={1000}
            required
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Nhập lý do rõ ràng…"
            className="w-full rounded-xl border border-border-strong bg-white px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-600 focus:outline-none"
          />
        </label>
        <div className="flex items-center justify-end gap-2.5 pt-2">
          <Button type="button" variant="secondary" onClick={onCancel}>Hủy</Button>
          <Button type="submit" variant="danger" disabled={!reason.trim()}>{confirmLabel}</Button>
        </div>
      </form>
    </Modal>
  );
}
