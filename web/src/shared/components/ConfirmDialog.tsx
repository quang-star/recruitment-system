import { Button, Modal } from "../ui";

export function ConfirmDialog({ open, title, description, confirmLabel, busy, onCancel, onConfirm }: {
  open: boolean; title: string; description: string; confirmLabel: string; busy: boolean;
  onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      closeDisabled={busy}
      title={title}
      titleId="confirm-dialog-title"
      size="sm"
    >
      <div className="pt-4 space-y-5">
        <p className="text-sm text-ink-600 m-0 leading-relaxed">{description}</p>
        <div className="flex items-center justify-end gap-2.5 pt-2">
          <Button type="button" variant="secondary" data-modal-autofocus disabled={busy} onClick={onCancel}>
            Hủy
          </Button>
          <Button type="button" variant="danger" disabled={busy} onClick={onConfirm}>
            {busy ? "Đang xử lý…" : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
