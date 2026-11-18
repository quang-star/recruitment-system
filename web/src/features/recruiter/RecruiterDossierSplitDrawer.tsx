import { ReactNode, useEffect, useState } from "react";
import { apiDownload } from "../../shared/api/client";
import { useModalFocus } from "../../shared/components/useModalFocus";
import { Badge, Button, ErrorBanner } from "../../shared/ui";

type RecruiterDossierSplitDrawerProps = {
  open: boolean;
  onClose: () => void;
  candidateName: string;
  stageLabel: string;
  cvAccessGranted: boolean;
  downloadPath: string;
  accessToken: string;
  page?: number;
  children: ReactNode;
};

/** Two-column split-view drawer pairing the embedded PDF CV viewer with candidate evaluation and stage actions. */
export function RecruiterDossierSplitDrawer({
  open,
  onClose,
  candidateName,
  stageLabel,
  cvAccessGranted,
  downloadPath,
  accessToken,
  page,
  children
}: RecruiterDossierSplitDrawerProps) {
  const ref = useModalFocus<HTMLElement>(open, onClose);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState("candidate-cv.pdf");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open || !cvAccessGranted) {
      setBlobUrl(null);
      setError(null);
      return;
    }
    const controller = new AbortController();
    let objectUrl: string | null = null;
    setLoading(true);
    setError(null);

    apiDownload(downloadPath, { accessToken, signal: controller.signal })
      .then(({ blob, filename: serverFilename }) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
        if (serverFilename) setFilename(serverFilename);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Không thể tải tệp CV lúc này.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, cvAccessGranted, downloadPath, accessToken, attempt]);

  if (!open) return null;

  const pdfSrc = blobUrl ? (page ? `${blobUrl}#page=${page}` : blobUrl) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/50 backdrop-blur-xs"
      role="presentation"
    >
      <section
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Đối chiếu hồ sơ ${candidateName}`}
        className="flex h-full w-full max-w-6xl flex-col border-l border-border-subtle bg-slate-50 shadow-dialog outline-none"
      >
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle bg-white px-5 py-3.5 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              ← Đóng đối chiếu
            </Button>
            <div className="flex items-center gap-2 min-w-0">
              <strong className="truncate text-sm font-bold text-ink-900">{candidateName}</strong>
              <Badge tone="neutral">{stageLabel}</Badge>
              {page && <Badge tone="brand">Trang {page}</Badge>}
            </div>
          </div>
          {blobUrl && (
            <div className="flex items-center gap-2">
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
                download={filename}
                className="inline-flex h-8 items-center rounded-lg border border-border-strong bg-white px-3 text-xs font-semibold text-ink-800 hover:bg-slate-50 no-underline"
              >
                Tải xuống
              </a>
            </div>
          )}
        </header>

        <div className="grid flex-1 min-h-0 lg:grid-cols-[1.15fr_0.95fr]">
          <div className="flex flex-col border-b lg:border-b-0 lg:border-r border-border-subtle bg-slate-100 min-h-[320px]">
            <div className="flex items-center justify-between border-b border-border-subtle bg-white px-4 py-2 text-xs text-ink-600">
              <span className="truncate font-medium">{filename}</span>
              {page ? <span className="font-semibold text-brand-700">Đang trỏ trang {page}</span> : null}
            </div>
            <div className="flex-1 min-h-0 p-3">
              {!cvAccessGranted ? (
                <div className="flex h-full items-center justify-center p-6">
                  <div className="max-w-sm rounded-xl border border-border-subtle bg-white p-5 text-center space-y-1.5">
                    <p className="text-sm font-semibold text-ink-900 m-0">Không còn quyền truy cập CV</p>
                    <p className="text-xs text-ink-500 m-0">
                      Quyền xem CV và điểm AI đã tự động đóng sau khi từ chối, rút hồ sơ hoặc thu hồi chia sẻ.
                    </p>
                  </div>
                </div>
              ) : loading ? (
                <div className="flex h-full items-center justify-center text-sm text-ink-500">
                  Đang tải tệp CV PDF…
                </div>
              ) : error ? (
                <div className="space-y-3 p-4">
                  <ErrorBanner tone="error" message={error} />
                  <Button type="button" variant="secondary" size="sm" onClick={() => setAttempt((a) => a + 1)}>
                    Thử tải lại CV
                  </Button>
                </div>
              ) : pdfSrc ? (
                <iframe
                  key={pdfSrc}
                  title={`CV ${candidateName}`}
                  src={pdfSrc}
                  className="h-full w-full rounded-lg border border-border-subtle bg-white"
                />
              ) : null}
            </div>
          </div>

          <div className="overflow-y-auto bg-white p-5">
            {children}
          </div>
        </div>
      </section>
    </div>
  );
}
