import { FormEvent, useEffect, useState } from "react";
import { ApiClientError, apiRequest } from "../../shared/api/client";
import { usePagedResource } from "../../shared/api/pagination";
import { PageControls } from "../../shared/components/PageControls";
import { Badge, Button, Card, EmptyState, ErrorBanner, Modal } from "../../shared/ui";
import { getCompanyCover, getCompanyLogo } from "../public/companyData";
import { fieldClass, labelClass, textareaClass } from "./adminTypes";
import { useAdminUserLookup } from "./useAdminUserLookup";

type Company = {
  companyId: string;
  legalName: string;
  displayName: string;
  slug: string;
  description: string | null;
  websiteUrl?: string | null;
  countryCode: string;
  registrationNumber: string | null;
  sizeRange?: string | null;
  logoUrl?: string | null;
  coverImageUrl?: string | null;
  status: "PENDING" | "ACTIVE" | "SUSPENDED" | "CLOSED";
  verificationStatus: string;
  version: number;
};
type Review = { id: string; actorUserId: string; action?: string; fromStatus: string; toStatus: string; reason: string; version: number; occurredAt: string };
type ReviewAction = "approve" | "reject" | "suspend" | "reactivate";
const statusLabels: Record<string, string> = { PENDING: "Chờ duyệt", ACTIVE: "Đang hoạt động", SUSPENDED: "Tạm ngưng", CLOSED: "Đã đóng" };
const actionLabels: Record<string, string> = { APPROVE: "Duyệt hoạt động", REJECT: "Từ chối", SUSPEND: "Tạm ngưng", REACTIVATE: "Kích hoạt lại" };
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
  const usersById = useAdminUserLookup(history.map((entry) => entry.actorUserId), accessToken);

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

  async function submitAction(action: ReviewAction) {
    if (!selected || busy || needsReload || !reason.trim()) return;
    const expectedStatusByAction: Record<ReviewAction, Company["status"]> = {
      approve: "PENDING",
      reject: "PENDING",
      suspend: "ACTIVE",
      reactivate: "SUSPENDED"
    };
    if (selected.status !== expectedStatusByAction[action]) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await apiRequest<Company>(`/api/v2/dashboard/companies/${selected.companyId}/${action}`, {
        method: "POST", accessToken, body: JSON.stringify({ version: selected.version, reason: reason.trim() })
      });
      setSelected(updated);
      setReason("");
      const successByAction: Record<ReviewAction, string> = {
        approve: `Đã duyệt ${updated.displayName}. Công ty có thể đăng tin tuyển dụng.`,
        reject: `Đã từ chối đăng ký công ty ${updated.displayName}.`,
        suspend: `Đã tạm ngưng hoạt động ${updated.displayName}; tin tuyển dụng và hồ sơ mới đã bị chặn.`,
        reactivate: `Đã kích hoạt lại ${updated.displayName}.`
      };
      setNotice(successByAction[action]);
      results.refresh();
    } catch (failure) {
      if (failure instanceof ApiClientError && failure.status === 409) {
        setNeedsReload(true);
        setError("Công ty đã thay đổi trạng thái hoặc đã được xử lý trước đó. Tải lại và kiểm tra trước khi thực hiện tiếp.");
      } else {
        setError(failure instanceof ApiClientError ? failure.error.message : "Không thể cập nhật trạng thái công ty. Vui lòng thử lại.");
      }
    } finally {
      setBusy(false);
    }
  }

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    if (selected.status === "PENDING") void submitAction("approve");
    else if (selected.status === "ACTIVE") void submitAction("suspend");
    else if (selected.status === "SUSPENDED") void submitAction("reactivate");
  }

  return (
    <section className="space-y-4" aria-label="Duyệt công ty">
      <Card padding="md" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-ink-900 m-0">Danh sách công ty</h2>
            <p className="text-sm text-ink-600 mt-1 mb-0">Chỉ công ty đã được duyệt hoạt động mới được đăng tin và xuất hiện công khai.</p>
          </div>
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => { clearSelection(); results.refresh(); }}>Tải lại danh sách</Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 rounded-md border border-border-subtle bg-slate-50/70 p-3">
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
          <div className="overflow-x-auto rounded-lg border border-border-subtle bg-white">
            <table className="w-full text-sm text-left" aria-label="Danh sách công ty cần xét duyệt">
              <thead className="bg-slate-50/90 border-b border-border-subtle text-xs font-semibold uppercase tracking-wider text-ink-500">
                <tr>
                  <th className="px-4 py-2.5">Công ty</th>
                  <th className="w-48 px-4 py-2.5">Quốc gia / Mã ĐK</th>
                  <th className="w-40 px-4 py-2.5">Trạng thái</th>
                  <th className="w-28 px-4 py-2.5 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">{results.items.map((company) => {
                const isSelected = selected?.companyId === company.companyId;
                return <tr key={company.companyId}
                  className={`transition-colors hover:bg-slate-50/80 ${isSelected ? "bg-brand-50/60" : ""}`}>
                  <td className="px-4 py-3 break-words">
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={getCompanyLogo(company.slug, company.displayName, company.logoUrl)}
                        alt={`Logo ${company.displayName}`}
                        className="h-10 w-10 shrink-0 rounded-lg border border-border-subtle bg-white object-contain p-0.5"
                      />
                      <div className="min-w-0 space-y-0.5">
                        <strong className="block truncate text-ink-900">{company.displayName}</strong>
                        <p className="text-xs text-ink-500 m-0 truncate">{company.legalName}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-700 align-middle">
                    <span className="font-medium">{company.countryCode || "—"}</span>
                    {company.registrationNumber && <span className="block text-ink-500">{company.registrationNumber}</span>}
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <Badge tone={statusTones[company.status] ?? "neutral"}>{statusLabels[company.status]}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right align-middle">
                    <Button size="sm" variant={isSelected ? "primary" : "secondary"} disabled={busy}
                      aria-label={`Chi tiết ${company.displayName}`} aria-pressed={isSelected} onClick={() => {
                        clearSelection(); setSelected(company);
                      }}>Chi tiết</Button>
                  </td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        )}
        <PageControls {...results} loading={results.loading || busy} onPageChange={(page) => { clearSelection(); results.setPage(page); }} label="Phân trang công ty" />
      </Card>

      <Modal
        open={Boolean(selected)}
        onClose={clearSelection}
        closeDisabled={busy}
        size="lg"
        title={selected?.displayName}
        description={selected ? `Mã định danh: ${selected.companyId} · Phiên bản ${selected.version}` : undefined}
      >
        {selected && (
          <div className="space-y-4 pt-4">
            <div className="overflow-hidden rounded-lg border border-border-subtle bg-white">
              <div
                className="relative h-32 sm:h-36 w-full bg-slate-900 bg-cover bg-center"
                style={{
                  backgroundImage: `linear-gradient(180deg, rgba(15, 23, 42, 0.14) 0%, rgba(15, 23, 42, 0.65) 100%), url("${getCompanyCover(selected.slug, selected.displayName, selected.coverImageUrl)}")`
                }}
              >
                <div className="absolute right-3 top-3">
                  <Badge tone={statusTones[selected.status] ?? "neutral"}>{statusLabels[selected.status]}</Badge>
                </div>
              </div>
              <div className="flex items-end gap-3.5 px-4 pb-3.5 -mt-8 relative z-10">
                <img
                  src={getCompanyLogo(selected.slug, selected.displayName, selected.logoUrl)}
                  alt={`Logo ${selected.displayName}`}
                  className="h-16 w-16 shrink-0 rounded-lg border-2 border-white bg-white object-contain p-1 shadow-sm"
                />
                <div className="min-w-0 pt-9">
                  <p className="text-sm font-bold text-ink-900 m-0 truncate">{selected.legalName}</p>
                  <p className="text-xs text-ink-500 m-0">
                    {selected.logoUrl ? "Đã tải logo riêng" : "Đang dùng logo mặc định"} · {selected.coverImageUrl ? "Đã tải ảnh nền riêng" : "Đang dùng ảnh nền mặc định"}
                  </p>
                </div>
              </div>
            </div>
            {notice && <ErrorBanner tone="success" message={notice} />}
            {error && <ErrorBanner message={error} />}
            <dl className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3 rounded-lg border border-border-subtle bg-slate-50/70 p-3.5 text-sm m-0">
              <div><dt className="text-xs font-semibold text-ink-500">Tên pháp lý</dt><dd className="ml-0 mt-0.5 font-semibold text-ink-900">{selected.legalName}</dd></div>
              <div><dt className="text-xs font-semibold text-ink-500">Quốc gia / mã đăng ký</dt><dd className="ml-0 mt-0.5 text-ink-800">{selected.countryCode} · {selected.registrationNumber || "Chưa cung cấp"}</dd></div>
              <div><dt className="text-xs font-semibold text-ink-500">Trạng thái hoạt động</dt><dd className="ml-0 mt-0.5 text-ink-800">{statusLabels[selected.status]}</dd></div>
              <div><dt className="text-xs font-semibold text-ink-500">Xác minh pháp lý</dt><dd className="ml-0 mt-0.5 text-ink-800">{selected.verificationStatus === "VERIFIED" ? "Đã xác minh" : "Chưa xác minh"}</dd></div>
            </dl>
            {selected.description && (
              <div className="rounded-lg border border-border-subtle bg-white p-3.5">
                <p className="text-xs font-semibold text-ink-500 m-0 mb-1">Giới thiệu công ty</p>
                <p className="text-sm text-ink-800 whitespace-pre-wrap m-0 leading-relaxed">{selected.description}</p>
              </div>
            )}
            {selected.status !== "CLOSED" ? (
              <form onSubmit={handleFormSubmit}
                className={`rounded-lg border p-4 space-y-3 ${selected.status === "ACTIVE" ? "border-amber-200 bg-amber-50/40" : "border-brand-200 bg-brand-50/30"}`}>
                <p className="text-xs text-ink-700 m-0">
                  {selected.status === "PENDING"
                    ? "Duyệt để cho phép công ty hoạt động hoặc từ chối hồ sơ đăng ký không hợp lệ."
                    : selected.status === "ACTIVE"
                      ? "Tạm ngưng sẽ ẩn công ty và các tin đang mở khỏi ứng viên, đồng thời chặn đăng tin hoặc ứng tuyển mới."
                      : "Kích hoạt lại cho phép công ty tiếp tục xuất hiện công khai và tuyển dụng."}
                </p>
                <label className={labelClass}>
                  {selected.status === "PENDING" ? "Lý do duyệt" : selected.status === "ACTIVE" ? "Lý do tạm ngưng" : "Lý do kích hoạt lại"}
                  <textarea className={textareaClass} rows={3} required maxLength={1000}
                    placeholder={selected.status === "PENDING"
                      ? "Ví dụ: Đã đối chiếu thông tin công ty hợp lệ hoặc lý do từ chối…"
                      : "Nhập lý do quản trị rõ ràng để lưu vào lịch sử…"}
                    value={reason} disabled={busy || needsReload}
                    onChange={(event) => setReason(event.target.value)} />
                </label>
                <div className="flex flex-wrap gap-2">
                  {selected.status === "PENDING" && <>
                    <Button type="submit" loading={busy} disabled={needsReload || !reason.trim()}>Duyệt hoạt động</Button>
                    <Button type="button" variant="danger" loading={busy} disabled={needsReload || !reason.trim()}
                      onClick={() => void submitAction("reject")}>Từ chối đăng ký</Button>
                  </>}
                  {selected.status === "ACTIVE" && (
                    <Button type="submit" variant="danger" loading={busy} disabled={needsReload || !reason.trim()}>Tạm ngưng hoạt động</Button>
                  )}
                  {selected.status === "SUSPENDED" && (
                    <Button type="submit" loading={busy} disabled={needsReload || !reason.trim()}>Kích hoạt lại</Button>
                  )}
                </div>
              </form>
            ) : (
              <p className="rounded-md border border-border-subtle bg-slate-50 px-3.5 py-2.5 text-xs text-ink-600 m-0">
                Công ty đã đóng; không còn hiển thị công khai hay tiếp nhận tin tuyển dụng mới.
              </p>
            )}
            {historyError && <ErrorBanner message={historyError} />}
            <div className="space-y-2 border-t border-border-subtle pt-3">
              <h4 className="text-sm font-bold text-ink-900 m-0">Lịch sử duyệt gần nhất</h4>
              {history.length === 0 ? <p className="text-sm text-ink-500 m-0">Chưa có lịch sử duyệt được ghi nhận.</p> : (
                <ol className="space-y-2 text-sm pl-0 list-none m-0">{history.map((entry) => <li key={entry.id} className="rounded-lg border border-border-subtle bg-slate-50/70 p-3 space-y-1">
                  <p className="m-0 text-xs font-semibold text-ink-800">
                    {entry.action && actionLabels[entry.action] ? `${actionLabels[entry.action]} · ` : ""}
                    {statusLabels[entry.fromStatus]} → {statusLabels[entry.toStatus]} · {new Date(entry.occurredAt).toLocaleString("vi-VN")}
                  </p>
                  <p className="m-0 text-sm text-ink-900">{entry.reason}</p>
                  <small className="block text-xs text-ink-500">
                    {usersById[entry.actorUserId] ? `${usersById[entry.actorUserId].email} (#${entry.actorUserId})` : `Admin #${entry.actorUserId}`} · Phiên bản {entry.version}
                  </small>
                </li>)}</ol>
              )}
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
