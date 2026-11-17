import { useEffect, useState } from "react";
import { apiDownload } from "../api/client";
import { Button, ErrorBanner } from "../ui";
import { useModalFocus } from "./useModalFocus";

export type CvPreviewModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  filename?: string;
  downloadPath: string;
  accessToken: string;
  page?: number;
};

export function CvPreviewModal({
  open,
  onClose,
  title = "Xem trước CV",
  filename,
  downloadPath,
  accessToken,
  page
}: CvPreviewModalProps) {
  const ref = useModalFocus<HTMLElement>(open, onClose);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [resolvedFilename, setResolvedFilename] = useState<string>(filename || "candidate-cv.pdf");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open) {
      setBlobUrl(null);
      setError(null);
      return;
    }

    const controller = new AbortController();
    let objectUrl: string | null = null;

    setLoading(true);
    setError(null);

    apiDownload(downloadPath, {
      accessToken,
      signal: controller.signal
    })
      .then(({ blob, filename: serverFilename }) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
        if (serverFilename && !filename) {
          setResolvedFilename(serverFilename);
        } else if (filename) {
          setResolvedFilename(filename);
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          err instanceof Error
            ? err.message
            : "Không thể tải tệp CV lúc này. Vui lòng thử lại sau."
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [open, downloadPath, accessToken, attempt, filename]);

  if (!open) return null;

  const displaySrc = blobUrl ? (page ? `${blobUrl}#page=${page}` : blobUrl) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-3 sm:p-5"
      role="presentation"
    >
      <section
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cv-preview-modal-title"
        className="w-full max-w-5xl rounded-2xl border border-border-subtle bg-white shadow-dialog overflow-hidden outline-none flex flex-col max-h-[92vh]"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-5 py-4 bg-white">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-brand-700 m-0">
              XEM TRƯỚC TỆP CV
            </p>
            <h2 id="cv-preview-modal-title" className="text-lg font-bold text-ink-900 m-0 truncate">
              {title}
            </h2>
            <small className="block text-xs text-ink-500 truncate">{resolvedFilename}</small>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {blobUrl && (
              <>
                <a
                  href={blobUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-8 items-center rounded-lg border border-border-strong bg-white px-3 text-xs font-semibold text-ink-800 hover:bg-slate-50 no-underline"
                >
                  Mở tab mới ↗
                </a>
                <a
                  href={blobUrl}
                  download={resolvedFilename}
                  className="inline-flex h-8 items-center rounded-lg border border-border-strong bg-white px-3 text-xs font-semibold text-ink-800 hover:bg-slate-50 no-underline"
                >
                  Tải về máy ↓
                </a>
              </>
            )}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              data-modal-autofocus
              onClick={onClose}
              aria-label="Đóng cửa sổ xem trước"
            >
              ✕ Đóng
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-slate-50 p-4">
          {loading && (
            <div className="flex items-center justify-center py-16 text-sm text-ink-600" role="status">
              <p className="m-0">Đang tải tài liệu PDF…</p>
            </div>
          )}

          {error && (
            <div className="max-w-lg mx-auto my-8">
              <ErrorBanner
                tone="error"
                message={error}
                action={
                  <Button type="button" size="sm" variant="secondary" onClick={() => setAttempt((v) => v + 1)}>
                    Thử lại
                  </Button>
                }
              />
            </div>
          )}

          {!loading && !error && displaySrc && (
            <iframe
              src={displaySrc}
              title={`Xem trước CV: ${resolvedFilename}`}
              className="w-full h-[72vh] rounded-xl border border-border-subtle bg-white"
            />
          )}
        </div>
      </section>
    </div>
  );
}
