import { useModalFocus } from "./useModalFocus";

export function ConfirmDialog({ open, title, description, confirmLabel, busy, onCancel, onConfirm }: {
  open: boolean; title: string; description: string; confirmLabel: string; busy: boolean;
  onCancel: () => void; onConfirm: () => void;
}) {
  const close = () => { if (!busy) onCancel(); };
  const ref = useModalFocus<HTMLElement>(open, close);
  if (!open) return null;
  return <div className="modal-backdrop" role="presentation">
    <section ref={ref} tabIndex={-1} className="modal-card" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
      <h2 id="confirm-dialog-title">{title}</h2><p>{description}</p>
      <div className="button-row"><button type="button" data-modal-autofocus disabled={busy} onClick={close}>Hủy</button>
        <button type="button" className="danger-button" disabled={busy} onClick={onConfirm}>{busy ? "Đang xử lý…" : confirmLabel}</button></div>
    </section>
  </div>;
}
