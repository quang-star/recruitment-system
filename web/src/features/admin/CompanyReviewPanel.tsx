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
    <section className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-5 items-start" aria-label="Duyệt công ty">
      <div className="min-w-0 max-h-[calc(100vh-144px)] overflow-y-auto pr-1">
        <Card padding="md" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-ink-900 m-0">Danh sách công ty</h2>
              <p className="text-sm text-ink-600 mt-1 mb-0">Chỉ công ty đã được duyệt hoạt động mới được đăng tin và xuất hiện công khai.</p>
            </div>
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => { clearSelection(); results.refresh(); }}>Tải lại danh sách</Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelClass}>Tìm công ty
              <input className={fieldClass} value={query} maxLength={200} disabled={busy}
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
          {results.loading ? <p role="status">Đang tải công ty…</p> : results.items.length === 0 ? (
            <EmptyState title="Không có công ty phù hợp" description="Thay đổi bộ lọc hoặc tải lại danh sách." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full table-fixed text-sm text-left" aria-label="Danh sách công ty cần xét duyệt">
                <thead><tr><th className="p-3">Công ty / trạng thái</th><th className="w-24 p-3">Thao tác</th></tr></thead>
                <tbody>{results.items.map((company) => <tr key={company.companyId}
                  className={`border-t border-border-subtle ${selected?.companyId === company.companyId ? "bg-brand-50/50" : ""}`}>
                  <td className="p-3 break-words space-y-1"><strong className="block">{company.displayName}</strong>
                    <p className="text-xs text-ink-500 m-0">{company.legalName}</p>
                    <Badge tone={company.status === "ACTIVE" ? "success" : "neutral"}>{statusLabels[company.status]}</Badge></td>
                  <td className="p-3"><Button size="sm" variant="secondary" disabled={busy}
                    aria-label={`Xem xét ${company.displayName}`} aria-pressed={selected?.companyId === company.companyId} onClick={() => {
                    clearSelection(); setSelected(company);
                  }}>Xem xét</Button></td>
                </tr>)}</tbody>
              </table>
            </div>
          )}
          <PageControls {...results} loading={results.loading || busy} onPageChange={(page) => { clearSelection(); results.setPage(page); }} label="Phân trang công ty" />
        </Card>
      </div>
      <div ref={detailRef} tabIndex={-1} role="region" aria-label="Chi tiết duyệt công ty"
        className="min-w-0 max-h-[calc(100vh-144px)] overflow-y-auto pr-1 space-y-4">
        {notice && <ErrorBanner tone="success" message={notice} />}
        {error && <ErrorBanner message={error} />}
        {selected && <Card padding="md" className="space-y-4">
          <h3 className="text-base font-bold m-0">{selected.displayName}</h3>
          <dl className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3 text-sm">
            <div><dt>Tên pháp lý</dt><dd className="ml-0 font-semibold">{selected.legalName}</dd></div>
            <div><dt>Quốc gia / mã đăng ký</dt><dd className="ml-0">{selected.countryCode} · {selected.registrationNumber || "Chưa cung cấp"}</dd></div>
            <div><dt>Trạng thái hoạt động</dt><dd className="ml-0">{statusLabels[selected.status]}</dd></div>
            <div><dt>Xác minh pháp lý</dt><dd className="ml-0">{selected.verificationStatus === "VERIFIED" ? "Đã xác minh" : "Chưa xác minh"}</dd></div>
          </dl>
          {selected.description && <p className="text-sm whitespace-pre-wrap">{selected.description}</p>}
          {selected.status === "PENDING" && <form onSubmit={(event) => void approve(event)} className="space-y-3">
            <p className="text-sm text-ink-600">Duyệt cho phép công ty hoạt động; thao tác này không xác nhận tư cách pháp lý.</p>
            <label className={labelClass}>Lý do duyệt
              <textarea className={textareaClass} rows={3} required maxLength={1000} value={reason} disabled={busy || needsReload}
                onChange={(event) => setReason(event.target.value)} />
            </label>
            <Button type="submit" loading={busy} disabled={needsReload || !reason.trim()}>Duyệt hoạt động</Button>
          </form>}
          {historyError && <ErrorBanner message={historyError} />}
          <h4 className="text-sm font-semibold m-0">Lịch sử duyệt gần nhất</h4>
          {history.length === 0 ? <p className="text-sm text-ink-500">Chưa có lịch sử duyệt được ghi nhận.</p> : (
            <ol className="space-y-2 text-sm pl-5">{history.map((entry) => <li key={entry.id}>
              <p className="m-0">{statusLabels[entry.fromStatus]} → {statusLabels[entry.toStatus]} · {new Date(entry.occurredAt).toLocaleString("vi-VN")}</p>
              <p className="m-0">{entry.reason}</p>
              <small>Admin #{entry.actorUserId} · Phiên bản {entry.version}</small>
            </li>)}</ol>
          )}
        </Card>}
        {!selected && <Card padding="md"><EmptyState title="Chọn công ty để xem xét"
          description="Thông tin công ty, lý do duyệt và lịch sử sẽ hiển thị tại đây." /></Card>}
      </div>
    </section>
  );
}
