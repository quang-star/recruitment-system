import { FormEvent, useEffect, useState } from "react";

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
  if (!open) return null;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reason.trim()) onConfirm(reason.trim());
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
    if (event.target === event.currentTarget) onCancel();
  }}>
    <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="reason-dialog-title">
      <div className="section-heading"><div><p className="eyebrow">Xác nhận thao tác</p><h2 id="reason-dialog-title">{title}</h2></div>
        <button className="icon-button secondary-button" type="button" aria-label="Đóng" onClick={onCancel}>×</button></div>
      <p className="muted">{description}</p>
      <form onSubmit={submit}>
        <label>Lý do<textarea autoFocus rows={4} maxLength={1000} required value={reason}
          onChange={(event) => setReason(event.target.value)} placeholder="Nhập lý do rõ ràng…" /></label>
        <div className="button-row modal-actions"><button className="secondary-button" type="button" onClick={onCancel}>Hủy</button>
          <button className="danger-button" type="submit" disabled={!reason.trim()}>{confirmLabel}</button></div>
      </form>
    </section>
  </div>;
}
