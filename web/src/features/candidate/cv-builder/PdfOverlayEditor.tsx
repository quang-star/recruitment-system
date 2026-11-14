import * as pdfjsLib from "pdfjs-dist";
import { useEffect, useRef, useState, type ChangeEvent, type MouseEvent, type PointerEvent } from "react";
import { ApiClientError, apiRequest } from "../../../shared/api/client";
import type { AuthSession } from "../../../shared/auth/session";
import { ExternalAiConsent, externalAiPolicyVersion } from "../../../shared/components/ExternalAiConsent";
import { Button, ErrorBanner, Modal } from "../../../shared/ui";
import type { CandidateCvRecord } from "../CandidateCvPanel";
import { AvatarCropModal } from "./AvatarCropModal";
import { ensurePdfJsWorker } from "./pdfExtract";
import { exportPdfWithOverlays, type OverlayKind, type PdfOverlayItem } from "./pdfOverlayExport";

type Props = {
  session: AuthSession;
  initialBytes?: Uint8Array | null;
  initialTitle?: string;
  onCvUploaded?: () => void;
  onClose: () => void;
  onLogout?: () => void;
};

type ToolMode = "select" | "whiteout" | "text";

const MAX_PDF_UPLOAD_BYTES = 10 * 1024 * 1024;

function makeId(): string {
  return `ov-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function isPdfHeader(bytes: Uint8Array): boolean {
  return bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
}

export function PdfOverlayEditor({
  session,
  initialBytes = null,
  initialTitle = "CV chỉnh sửa trực tiếp",
  onCvUploaded,
  onClose,
  onLogout,
}: Props) {
  const [sourceBytes, setSourceBytes] = useState<Uint8Array | null>(initialBytes);
  const [docTitle, setDocTitle] = useState(initialTitle);
  const [numPages, setNumPages] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState({ width: 595, height: 842 });
  const [zoom, setZoom] = useState(1);
  const [tool, setTool] = useState<ToolMode>("text");
  const [overlays, setOverlays] = useState<PdfOverlayItem[]>([]);
  const [undoStack, setUndoStack] = useState<PdfOverlayItem[][]>([]);
  const [redoStack, setRedoStack] = useState<PdfOverlayItem[][]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingStampFile, setPendingStampFile] = useState<File | null>(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [externalAiConsent, setExternalAiConsent] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<{
    id: string;
    mode: "move" | "resize";
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
  } | null>(null);

  useEffect(() => {
    setSourceBytes(initialBytes);
    setDocTitle(initialTitle);
    setPageIndex(0);
    setOverlays([]);
    setUndoStack([]);
    setRedoStack([]);
    setSelectedId(null);
  }, [initialBytes, initialTitle]);

  useEffect(() => {
    if (!sourceBytes) {
      setNumPages(0);
      return;
    }
    let cancelled = false;
    let pdfInstance: pdfjsLib.PDFDocumentProxy | null = null;
    ensurePdfJsWorker();

    void (async () => {
      try {
        setError(null);
        const task = pdfjsLib.getDocument({ data: sourceBytes.slice() });
        pdfInstance = await task.promise;
        if (cancelled) return;
        setNumPages(pdfInstance.numPages);
        const targetPage = Math.min(pageIndex, Math.max(0, pdfInstance.numPages - 1));
        if (targetPage !== pageIndex) setPageIndex(targetPage);

        const page = await pdfInstance.getPage(targetPage + 1);
        if (cancelled) return;
        const viewport = page.getViewport({ scale: zoom * 1.25 });
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        setPageSize({ width: Math.round(viewport.width), height: Math.round(viewport.height) });
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      } catch {
        if (!cancelled) {
          setError("Không render được trang PDF này. Kiểm tra lại định dạng file PDF hợp lệ.");
        }
      } finally {
        await pdfInstance?.destroy();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sourceBytes, pageIndex, zoom]);

  function commitOverlays(next: PdfOverlayItem[], pushHistory = true) {
    if (pushHistory) {
      setUndoStack(prev => [...prev.slice(-24), overlays]);
      setRedoStack([]);
    }
    setOverlays(next);
  }

  function handleUndo() {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack(s => s.slice(0, -1));
    setRedoStack(s => [...s.slice(-24), overlays]);
    setOverlays(prev);
  }

  function handleRedo() {
    if (redoStack.length === 0) return;
    const restored = redoStack[redoStack.length - 1];
    setRedoStack(s => s.slice(0, -1));
    setUndoStack(s => [...s.slice(-24), overlays]);
    setOverlays(restored);
  }

  async function handleSelectLocalPdf(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_PDF_UPLOAD_BYTES) {
      setError("File PDF vượt quá 10 MiB.");
      return;
    }
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    if (!isPdfHeader(bytes)) {
      setError("Tệp đã chọn không phải PDF hợp lệ (%PDF-).");
      return;
    }
    setSourceBytes(bytes);
    setDocTitle(file.name.replace(/\.pdf$/i, "") + " (đã chỉnh sửa)");
    setPageIndex(0);
    setOverlays([]);
    setUndoStack([]);
    setRedoStack([]);
    setSelectedId(null);
    setError(null);
    setNotice("Đã mở PDF gốc. Chọn công cụ bên trên rồi nhấp trực tiếp lên trang để chỉnh sửa.");
  }

  function addItemAt(kind: OverlayKind, xPct: number, yPct: number, imageDataUrl?: string) {
    const item: PdfOverlayItem = {
      id: makeId(),
      pageIndex,
      kind,
      xPct: Math.max(2, Math.min(82, xPct)),
      yPct: Math.max(2, Math.min(88, yPct)),
      wPct: kind === "image" ? 16 : kind === "whiteout" ? 26 : 32,
      hPct: kind === "image" ? 12 : kind === "whiteout" ? 4.5 : 5.5,
      text: kind === "text" ? "Nội dung mới" : "",
      fontSizePt: 11,
      bold: false,
      color: "#0f172a",
      opaqueBg: kind === "text",
      imageDataUrl,
    };
    commitOverlays([...overlays, item]);
    setSelectedId(item.id);
    setTool("select");
  }

  function handleStageClick(event: MouseEvent<HTMLDivElement>) {
    if (tool === "select" || !stageRef.current || dragState.current) return;
    if (event.target !== stageRef.current && event.target !== canvasRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const xPct = ((event.clientX - rect.left) / rect.width) * 100;
    const yPct = ((event.clientY - rect.top) / rect.height) * 100;
    addItemAt(tool, xPct, yPct);
  }

  function startOverlayDrag(id: string, mode: "move" | "resize") {
    return (event: PointerEvent<HTMLElement>) => {
      event.stopPropagation();
      const target = overlays.find(o => o.id === id);
      if (!target) return;
      setSelectedId(id);
      event.currentTarget.setPointerCapture(event.pointerId);
      setUndoStack(prev => [...prev.slice(-24), overlays]);
      setRedoStack([]);
      dragState.current = {
        id,
        mode,
        startX: event.clientX,
        startY: event.clientY,
        origX: target.xPct,
        origY: target.yPct,
        origW: target.wPct,
        origH: target.hPct,
      };
    };
  }

  function handleOverlayMove(event: PointerEvent<HTMLElement>) {
    const drag = dragState.current;
    if (!drag || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const dxPct = ((event.clientX - drag.startX) / rect.width) * 100;
    const dyPct = ((event.clientY - drag.startY) / rect.height) * 100;

    setOverlays(prev =>
      prev.map(item => {
        if (item.id !== drag.id) return item;
        if (drag.mode === "move") {
          return {
            ...item,
            xPct: Math.max(0, Math.min(100 - item.wPct, drag.origX + dxPct)),
            yPct: Math.max(0, Math.min(100 - item.hPct, drag.origY + dyPct)),
          };
        }
        return {
          ...item,
          wPct: Math.max(4, Math.min(100 - item.xPct, drag.origW + dxPct)),
          hPct: Math.max(2.5, Math.min(100 - item.yPct, drag.origH + dyPct)),
        };
      }),
    );
  }

  function endOverlayDrag() {
    dragState.current = null;
  }

  const selected = overlays.find(item => item.id === selectedId) ?? null;
  const pageOverlays = overlays.filter(item => item.pageIndex === pageIndex);

  function updateSelected(patch: Partial<PdfOverlayItem>, recordHistory = true) {
    if (!selected) return;
    commitOverlays(
      overlays.map(item => (item.id === selected.id ? { ...item, ...patch } : item)),
      recordHistory,
    );
  }

  async function handleDownloadEditedPdf() {
    if (!sourceBytes) return;
    setBusy("download");
    setError(null);
    try {
      const bytes = await exportPdfWithOverlays(sourceBytes, overlays);
      const blob = new Blob([Uint8Array.from(bytes)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(docTitle.trim() || "cv-chinh-sua").replace(/[\\/:*?"<>|]+/g, "_")}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("Đã xuất và tải xuống file PDF đã chỉnh sửa.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chưa xuất được file PDF.");
    } finally {
      setBusy(null);
    }
  }

  async function handleUploadEditedPdf() {
    if (!sourceBytes) return;
    setBusy("upload");
    setError(null);
    try {
      const bytes = await exportPdfWithOverlays(sourceBytes, overlays);
      const safeName = `${(docTitle.trim() || "cv-chinh-sua").replace(/[\\/:*?"<>|]+/g, "_")}.pdf`;
      const file = new File([Uint8Array.from(bytes)], safeName, { type: "application/pdf" });
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", (docTitle.trim() || "CV chỉnh sửa trực tiếp").slice(0, 160));
      formData.append("externalAiConsent", String(externalAiConsent));
      if (externalAiConsent) {
        formData.append("externalAiPolicyVersion", externalAiPolicyVersion);
      }
      await apiRequest<CandidateCvRecord>("/api/v2/cvs", {
        method: "POST",
        accessToken: session.accessToken,
        body: formData,
      });
      setExternalAiConsent(false);
      setUploadModalOpen(false);
      onCvUploaded?.();
      setNotice("Đã lưu file PDF mới vào thư viện CV (CV gốc không thay đổi).");
    } catch (failure) {
      if (failure instanceof ApiClientError && failure.status === 401) {
        onLogout?.();
      } else if (failure instanceof ApiClientError) {
        setError(failure.error.message);
      } else {
        setError("Chưa lưu được PDF lên thư viện CV. Bạn vẫn có thể tải xuống về máy.");
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Modal
        open={!uploadModalOpen && !pendingStampFile}
        onClose={onClose}
        title="Sửa nhanh trực tiếp trên PDF gốc"
        eyebrow="PDF VISUAL OVERLAY EDITOR"
        description="Che chữ cũ, chèn chữ mới tiếng Việt hoặc thêm ảnh trực tiếp lên từng trang PDF, rồi xuất bản PDF mới sắc nét."
        size="full"
        closeDisabled={Boolean(busy)}
        closeLabel="Đóng trình sửa PDF"
      >
        <div className="space-y-3 py-3">
          {/* Top toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-border-subtle bg-slate-50 px-3.5 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex h-9 cursor-pointer items-center rounded-lg border border-border-strong bg-white px-3 text-xs font-semibold text-ink-800 hover:bg-slate-100">
                Chọn file PDF…
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  aria-label="Chọn file PDF để sửa trực tiếp"
                  className="sr-only"
                  onChange={event => void handleSelectLocalPdf(event)}
                />
              </label>

              <input
                type="text"
                aria-label="Tên file PDF xuất"
                value={docTitle}
                maxLength={160}
                onChange={e => setDocTitle(e.target.value)}
                className="h-9 min-w-[200px] rounded-lg border border-border-strong bg-white px-3 text-xs font-semibold text-ink-900"
              />

              <div className="flex items-center gap-1 rounded-lg border border-border-subtle bg-white p-1" role="group" aria-label="Công cụ sửa PDF">
                <Button size="sm" variant={tool === "select" ? "primary" : "ghost"} onClick={() => setTool("select")}>
                  Chọn / Kéo
                </Button>
                <Button size="sm" variant={tool === "whiteout" ? "primary" : "ghost"} onClick={() => setTool("whiteout")}>
                  Che chữ cũ
                </Button>
                <Button size="sm" variant={tool === "text" ? "primary" : "ghost"} onClick={() => setTool("text")}>
                  + Chèn chữ
                </Button>
                <label className="inline-flex cursor-pointer items-center rounded-lg px-2.5 py-1 text-xs font-semibold text-ink-700 hover:bg-slate-100">
                  + Chèn ảnh
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    aria-label="Chèn ảnh lên PDF"
                    className="sr-only"
                    onChange={e => {
                      const file = e.target.files?.[0] ?? null;
                      e.target.value = "";
                      if (file) setPendingStampFile(file);
                    }}
                  />
                </label>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="ghost" disabled={undoStack.length === 0 || Boolean(busy)} onClick={handleUndo}>
                ↶ Hoàn tác
              </Button>
              <Button size="sm" variant="ghost" disabled={redoStack.length === 0 || Boolean(busy)} onClick={handleRedo}>
                ↷ Làm lại
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={!sourceBytes || Boolean(busy)}
                onClick={() => void handleDownloadEditedPdf()}
              >
                {busy === "download" ? "Đang xuất PDF…" : "Tải PDF đã sửa"}
              </Button>
              <Button
                size="sm"
                variant="primary"
                disabled={!sourceBytes || Boolean(busy)}
                onClick={() => setUploadModalOpen(true)}
              >
                Lưu vào thư viện CV
              </Button>
            </div>
          </div>

          {error && <ErrorBanner message={error} />}
          {notice && (
            <p role="status" className="m-0 rounded-lg border border-brand-100 bg-brand-50 px-3.5 py-2 text-xs text-brand-900">
              {notice}
            </p>
          )}

          <div className="grid gap-4 lg:grid-cols-[290px_minmax(0,1fr)]">
            {/* Inspector & quick layer controls */}
            <aside className="space-y-3 rounded-xl border border-border-subtle bg-slate-50 p-3">
              <div className="space-y-2 rounded-lg border border-border-subtle bg-white p-3 text-xs">
                <h3 className="m-0 text-xs font-bold uppercase tracking-wide text-ink-800">Thuộc tính lớp phủ</h3>
                {!selected ? (
                  <p className="m-0 text-ink-500">
                    Chọn công cụ <strong>+ Chèn chữ</strong> hoặc <strong>Che chữ cũ</strong> rồi nhấp lên trang PDF bên cạnh.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {selected.kind === "text" && (
                      <>
                        <label className="block font-medium text-ink-700">
                          Nội dung chữ
                          <textarea
                            rows={3}
                            value={selected.text}
                            onChange={e => updateSelected({ text: e.target.value })}
                            className="mt-1 w-full rounded-lg border border-border-strong p-2 text-xs text-ink-900"
                          />
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="block font-medium text-ink-700">
                            Cỡ chữ (pt)
                            <input
                              type="number"
                              min={7}
                              max={32}
                              value={selected.fontSizePt}
                              onChange={e => updateSelected({ fontSizePt: Number(e.target.value) || 11 })}
                              className="mt-1 h-8 w-full rounded-lg border border-border-strong px-2 text-xs"
                            />
                          </label>
                          <label className="block font-medium text-ink-700">
                            Màu chữ
                            <input
                              type="color"
                              value={selected.color}
                              onChange={e => updateSelected({ color: e.target.value })}
                              className="mt-1 h-8 w-full cursor-pointer rounded-lg border border-border-strong bg-white p-0.5"
                            />
                          </label>
                        </div>
                        <div className="flex flex-wrap gap-3">
                          <label className="flex cursor-pointer items-center gap-1.5 font-medium text-ink-700">
                            <input
                              type="checkbox"
                              checked={selected.bold}
                              onChange={e => updateSelected({ bold: e.target.checked })}
                            />
                            In đậm
                          </label>
                          <label className="flex cursor-pointer items-center gap-1.5 font-medium text-ink-700">
                            <input
                              type="checkbox"
                              checked={selected.opaqueBg}
                              onChange={e => updateSelected({ opaqueBg: e.target.checked })}
                            />
                            Nền trắng che chữ gốc
                          </label>
                        </div>
                      </>
                    )}
                    <div className="flex justify-between gap-2 pt-1 border-t border-border-subtle">
                      <span className="text-[11px] text-ink-500">
                        {selected.kind === "whiteout" ? "Hộp che chữ" : selected.kind === "image" ? "Ảnh chèn" : "Ô chữ"}
                      </span>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => {
                          commitOverlays(overlays.filter(o => o.id !== selected.id));
                          setSelectedId(null);
                        }}
                      >
                        Xóa lớp này
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {numPages > 0 && (
                <div className="space-y-2 rounded-lg border border-border-subtle bg-white p-3 text-xs">
                  <div className="flex items-center justify-between font-semibold text-ink-800">
                    <span>Trang {pageIndex + 1} / {numPages}</span>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" disabled={pageIndex === 0} onClick={() => setPageIndex(p => p - 1)}>
                        ◀
                      </Button>
                      <Button size="sm" variant="ghost" disabled={pageIndex >= numPages - 1} onClick={() => setPageIndex(p => p + 1)}>
                        ▶
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-ink-700">Thu phóng:</span>
                    <div className="flex gap-1">
                      {[0.8, 1, 1.25].map(z => (
                        <button
                          key={z}
                          type="button"
                          onClick={() => setZoom(z)}
                          className={`cursor-pointer rounded border px-2 py-0.5 text-[11px] font-semibold ${
                            zoom === z ? "border-brand-600 bg-brand-50 text-brand-700" : "border-border-subtle text-ink-600"
                          }`}
                        >
                          {Math.round(z * 100)}%
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </aside>

            {/* PDF Canvas + Interactive Overlay Stage */}
            <section className="max-h-[72vh] overflow-auto rounded-xl border border-border-subtle bg-[#eef2f6] p-4">
              {!sourceBytes ? (
                <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-slate-300 bg-white/80 p-8 text-center">
                  <p className="m-0 text-sm font-bold text-ink-800">Chưa có file PDF nào được mở</p>
                  <p className="m-0 max-w-md text-xs text-ink-600">
                    Tải file CV PDF bất kỳ từ máy để che thông tin cũ, sửa ngày tháng, thêm mô tả tiếng Việt hoặc gắn ảnh thẻ ngay trên trang gốc.
                  </p>
                </div>
              ) : (
                <div
                  ref={stageRef}
                  onClick={handleStageClick}
                  style={{ width: pageSize.width, height: pageSize.height }}
                  className={`relative mx-auto bg-white shadow-md select-none ${
                    tool !== "select" ? "cursor-crosshair" : "cursor-default"
                  }`}
                >
                  <canvas ref={canvasRef} className="block h-full w-full" aria-label={`Trang PDF ${pageIndex + 1}`} />

                  {pageOverlays.map(item => {
                    const isSelected = item.id === selectedId;
                    return (
                      <div
                        key={item.id}
                        onPointerDown={startOverlayDrag(item.id, "move")}
                        onPointerMove={handleOverlayMove}
                        onPointerUp={endOverlayDrag}
                        onClick={e => {
                          e.stopPropagation();
                          setSelectedId(item.id);
                        }}
                        style={{
                          left: `${item.xPct}%`,
                          top: `${item.yPct}%`,
                          width: `${item.wPct}%`,
                          height: `${item.hPct}%`,
                          backgroundColor: item.kind === "whiteout" || item.opaqueBg ? "#ffffff" : "transparent",
                          color: item.color,
                          fontSize: `${item.fontSizePt * zoom * 1.1}px`,
                          fontWeight: item.bold ? 700 : 400,
                        }}
                        className={`absolute cursor-move overflow-hidden p-0.5 leading-tight ${
                          isSelected
                            ? "ring-2 ring-brand-600 border border-brand-600"
                            : "border border-dashed border-slate-400/70 hover:border-brand-500"
                        }`}
                      >
                        {item.kind === "image" && item.imageDataUrl && (
                          <img src={item.imageDataUrl} alt="Ảnh chèn trên PDF" className="h-full w-full object-contain pointer-events-none" />
                        )}
                        {item.kind === "text" && (
                          <div className="h-full w-full whitespace-pre-wrap break-words font-sans">{item.text}</div>
                        )}
                        {isSelected && (
                          <button
                            type="button"
                            aria-label="Thay đổi kích thước lớp phủ"
                            onPointerDown={startOverlayDrag(item.id, "resize")}
                            onPointerMove={handleOverlayMove}
                            onPointerUp={endOverlayDrag}
                            className="absolute right-0 bottom-0 h-3 w-3 cursor-nwse-resize bg-brand-600"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </div>
      </Modal>

      <AvatarCropModal
        file={pendingStampFile}
        onCancel={() => setPendingStampFile(null)}
        onConfirm={dataUrl => {
          setPendingStampFile(null);
          addItemAt("image", 68, 8, dataUrl);
        }}
      />

      <Modal
        open={uploadModalOpen}
        onClose={() => {
          if (!busy) setUploadModalOpen(false);
        }}
        title="Lưu PDF đã chỉnh sửa vào thư viện"
        description="Hệ thống tạo file PDF mới chứa các chỉnh sửa của bạn; CV gốc trước đó vẫn được giữ nguyên."
        size="md"
        closeDisabled={Boolean(busy)}
      >
        <div className="space-y-4 py-3">
          <ExternalAiConsent
            checked={externalAiConsent}
            disabled={Boolean(busy)}
            onChange={setExternalAiConsent}
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="secondary" disabled={Boolean(busy)} onClick={() => setUploadModalOpen(false)}>
              Hủy
            </Button>
            <Button size="sm" variant="primary" disabled={Boolean(busy)} onClick={() => void handleUploadEditedPdf()}>
              {busy === "upload" ? "Đang lưu vào thư viện…" : "Xác nhận lưu PDF mới"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
