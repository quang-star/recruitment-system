import { FormEvent, useEffect, useRef, useState } from "react";
import { ApiClientError, apiRequest } from "../../shared/api/client";
import { usePagedResource } from "../../shared/api/pagination";
import { PageControls } from "../../shared/components/PageControls";
import { Badge, Button, Card, EmptyState, ErrorBanner } from "../../shared/ui";
import { fieldClass, labelClass, textareaClass } from "./adminTypes";

type Company = {
  companyId: string;
  legalName: string;
  displayName: string;
  slug: string;
  description: string | null;
  countryCode: string;
  registrationNumber: string | null;
  status: "PENDING" | "ACTIVE" | "SUSPENDED" | "CLOSED";
  verificationStatus: string;
  version: number;
};
type Review = { id: string; actorUserId: string; fromStatus: string; toStatus: string; reason: string; version: number; occurredAt: string };
const statusLabels: Record<string, string> = { PENDING: "Chờ duyệt", ACTIVE: "Đang hoạt động", SUSPENDED: "Tạm ngưng", CLOSED: "Đã đóng" };
const statusTones: Record<string, "warning" | "success" | "danger" | "neutral"> = {
  PENDING: "warning",
  ACTIVE: "success",
  SUSPENDED: "danger",
  CLOSED: "neutral"
};

export function CompanyReviewPanel({ accessToken }: { accessToken: string }) {
  const [status, setStatus] = useState("PENDING");
  const [query, setQuery] = useState("");
  const results = usePagedResource<Company>("/api/v2/dashboard/companies", { status, q: query }, accessToken, 20);
  const [selected, setSelected] = useState<Company | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [needsReload, setNeedsReload] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [history, setHistory] = useState<Review[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selected && detailRef.current) {
      detailRef.current.scrollTop = 0;
      detailRef.current.focus({ preventScroll: true });
    }
  }, [selected?.companyId]);

  useEffect(() => {
    setHistory([]);
    setHistoryError(null);
    if (!selected) return;
    const controller = new AbortController();
    void apiRequest<Review[]>(`/api/v2/dashboard/companies/${selected.companyId}/history`, {
      accessToken, signal: controller.signal
    }).then((items) => {
      if (!controller.signal.aborted) setHistory(items);
    }).catch(() => {
      if (!controller.signal.aborted) setHistoryError("Không thể tải lịch sử duyệt công ty.");
    });
    return () => controller.abort();
  }, [selected?.companyId, selected?.version, accessToken]);

  function clearSelection() {
    setSelected(null);
    setReason("");
    setNeedsReload(false);
    setError(null);
    setNotice(null);
  }

  async function approve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || busy || needsReload || selected.status !== "PENDING" || !reason.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const approved = await apiRequest<Company>(`/api/v2/dashboard/companies/${selected.companyId}/approve`, {
        method: "POST", accessToken, body: JSON.stringify({ version: selected.version, reason: reason.trim() })
      });
      setSelected(approved);
      setReason("");
      setNotice(`Đã duyệt ${approved.displayName}. Công ty có thể đăng tin tuyển dụng.`);
      results.refresh();
    } catch (failure) {
      if (failure instanceof ApiClientError && failure.status === 409) {
        setNeedsReload(true);
        setError("Công ty đã thay đổi hoặc đã được duyệt. Tải lại và kiểm tra trước khi thực hiện tiếp.");
      } else {
        setError(failure instanceof ApiClientError ? failure.error.message : "Không thể duyệt công ty. Vui lòng thử lại.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid gap-5 items-start xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]" aria-label="Duyệt công ty">
      <div className="min-w-0">
        <Card padding="md" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-ink-900 m-0">Danh sách công ty</h2>
              <p className="text-sm text-ink-600 mt-1 mb-0">Chỉ công ty đã được duyệt hoạt động mới được đăng tin và xuất hiện công khai.</p>
            </div>
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => { clearSelection(); results.refresh(); }}>Tải lại danh sách</Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 rounded-xl border border-border-subtle bg-slate-50/70 p-3">
            <label className={labelClass}>Tìm công ty
              <input className={fieldClass} placeholder="Tên hiển thị, tên pháp lý…" value={query} maxLength={200} disabled={busy}
                onChange={(event) => { clearSelection(); setQuery(event.target.value); }} />
            </label>
            <label className={labelClass}>Trạng thái công ty
              <select className={fieldClass} value={status} disabled={busy}
                onChange={(event) => { clearSelection(); setStatus(event.target.value); }}>
                <option value="">Tất cả</option>
                {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </div>
          {results.error && <ErrorBanner message={results.error} />}
          {results.loading ? <p role="status" className="text-sm text-ink-500 m-0">Đang tải công ty…</p> : results.items.length === 0 ? (
            <EmptyState title="Không có công ty phù hợp" description="Thay đổi bộ lọc hoặc tải lại danh sách." />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border-subtle bg-white">
              <table className="w-full table-fixed text-sm text-left" aria-label="Danh sách công ty cần xét duyệt">
                <thead className="bg-slate-50/90 border-b border-border-subtle text-[11px] font-semibold uppercase tracking-wider text-ink-500">
                  <tr><th className="px-4 py-2.5">Công ty / trạng thái</th><th className="w-28 px-4 py-2.5 text-right">Thao tác</th></tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">{results.items.map((company) => {
                  const isSelected = selected?.companyId === company.companyId;
                  return <tr key={company.companyId}
                    className={`transition-colors hover:bg-slate-50/80 ${isSelected ? "bg-brand-50/60 border-l-4 border-l-brand-600" : ""}`}>
                    <td className="px-4 py-3 break-words space-y-1"><strong className="block text-ink-900">{company.displayName}</strong>
                      <p className="text-xs text-ink-500 m-0">{company.legalName}</p>
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        <Badge tone={statusTones[company.status] ?? "neutral"}>{statusLabels[company.status]}</Badge>
                        {company.countryCode && <span className="text-[11px] text-ink-500">{company.countryCode}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right align-middle"><Button size="sm" variant={isSelected ? "primary" : "secondary"} disabled={busy}
                      aria-label={`Xem xét ${company.displayName}`} aria-pressed={isSelected} onClick={() => {
                      clearSelection(); setSelected(company);
                    }}>Xem xét</Button></td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
          )}
          <PageControls {...results} loading={results.loading || busy} onPageChange={(page) => { clearSelection(); results.setPage(page); }} label="Phân trang công ty" />
        </Card>
      </div>
      <div ref={detailRef} tabIndex={-1} role="region" aria-label="Chi tiết duyệt công ty"
        className="min-w-0 xl:sticky xl:top-6 space-y-4 focus:outline-none">
        {notice && <ErrorBanner tone="success" message={notice} />}
        {error && <ErrorBanner message={error} />}
        {selected && <Card padding="md" className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border-subtle pb-3">
            <div>
              <h3 className="text-lg font-bold text-ink-900 m-0">{selected.displayName}</h3>
              <p className="text-xs text-ink-500 m-0 mt-0.5">Mã định danh: <span className="font-mono">{selected.companyId}</span> · Phiên bản {selected.version}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Badge tone={statusTones[selected.status] ?? "neutral"}>{statusLabels[selected.status]}</Badge>
            </div>
          </div>
          <dl className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3 rounded-xl border border-border-subtle bg-slate-50/70 p-3.5 text-sm m-0">
            <div><dt className="text-xs font-semibold text-ink-500">Tên pháp lý</dt><dd className="ml-0 mt-0.5 font-semibold text-ink-900">{selected.legalName}</dd></div>
            <div><dt className="text-xs font-semibold text-ink-500">Quốc gia / mã đăng ký</dt><dd className="ml-0 mt-0.5 text-ink-800">{selected.countryCode} · {selected.registrationNumber || "Chưa cung cấp"}</dd></div>
            <div><dt className="text-xs font-semibold text-ink-500">Trạng thái hoạt động</dt><dd className="ml-0 mt-0.5 text-ink-800">{statusLabels[selected.status]}</dd></div>
            <div><dt className="text-xs font-semibold text-ink-500">Xác minh pháp lý</dt><dd className="ml-0 mt-0.5 text-ink-800">{selected.verificationStatus === "VERIFIED" ? "Đã xác minh" : "Chưa xác minh"}</dd></div>
          </dl>
          {selected.description && (
            <div className="rounded-xl border border-border-subtle bg-white p-3.5">
              <p className="text-xs font-semibold text-ink-500 m-0 mb-1">Giới thiệu công ty</p>
              <p className="text-sm text-ink-800 whitespace-pre-wrap m-0 leading-relaxed">{selected.description}</p>
            </div>
          )}
          {selected.status === "PENDING" && <form onSubmit={(event) => void approve(event)} className="rounded-xl border border-brand-200 bg-brand-50/30 p-4 space-y-3">
            <p className="text-xs text-ink-700 m-0">Duyệt cho phép công ty hoạt động; thao tác này không xác nhận tư cách pháp lý.</p>
            <label className={labelClass}>Lý do duyệt
              <textarea className={textareaClass} rows={3} required maxLength={1000} placeholder="Ví dụ: Đã đối chiếu thông tin công ty hợp lệ…" value={reason} disabled={busy || needsReload}
                onChange={(event) => setReason(event.target.value)} />
            </label>
            <Button type="submit" loading={busy} disabled={needsReload || !reason.trim()}>Duyệt hoạt động</Button>
          </form>}
          {historyError && <ErrorBanner message={historyError} />}
          <div className="space-y-2 border-t border-border-subtle pt-3">
            <h4 className="text-sm font-bold text-ink-900 m-0">Lịch sử duyệt gần nhất</h4>
            {history.length === 0 ? <p className="text-sm text-ink-500 m-0">Chưa có lịch sử duyệt được ghi nhận.</p> : (
              <ol className="space-y-2 text-sm pl-0 list-none m-0">{history.map((entry) => <li key={entry.id} className="rounded-xl border border-border-subtle bg-slate-50/70 p-3 space-y-1">
                <p className="m-0 text-xs font-semibold text-ink-800">{statusLabels[entry.fromStatus]} → {statusLabels[entry.toStatus]} · {new Date(entry.occurredAt).toLocaleString("vi-VN")}</p>
                <p className="m-0 text-sm text-ink-900">{entry.reason}</p>
                <small className="block text-xs text-ink-500">Admin #{entry.actorUserId} · Phiên bản {entry.version}</small>
              </li>)}</ol>
            )}
          </div>
        </Card>}
        {!selected && <Card padding="md"><EmptyState title="Chọn công ty để xem xét"
          description="Thông tin công ty, lý do duyệt và lịch sử sẽ hiển thị tại đây." /></Card>}
      </div>
    </section>
  );
}
