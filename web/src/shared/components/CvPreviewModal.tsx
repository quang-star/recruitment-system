import { useEffect, useState } from "react";
import { apiDownload } from "../api/client";
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
    <div className="modal-backdrop cv-preview-backdrop" role="presentation">
      <section
        ref={ref}
        tabIndex={-1}
        className="modal-card cv-preview-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cv-preview-modal-title"
      >
        <div className="cv-preview-header">
          <div className="cv-preview-title-group">
            <p className="eyebrow">XEM TRƯỚC TỆP CV</p>
            <h2 id="cv-preview-modal-title">{title}</h2>
            <small className="muted">{resolvedFilename}</small>
          </div>

          <div className="button-row cv-preview-actions">
            {blobUrl && (
              <>
                <a
                  href={blobUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="secondary-button compact-btn"
                >
                  Mở tab mới ↗
                </a>
                <a
                  href={blobUrl}
                  download={resolvedFilename}
                  className="secondary-button compact-btn"
                >
                  Tải về máy ↓
                </a>
              </>
            )}
            <button
              type="button"
              className="secondary-button compact-btn close-modal-btn"
              data-modal-autofocus
              onClick={onClose}
              aria-label="Đóng cửa sổ xem trước"
            >
              ✕ Đóng
            </button>
          </div>
        </div>

        <div className="cv-preview-content">
          {loading && (
            <div className="cv-preview-loading" role="status">
              <p>Đang tải tài liệu PDF…</p>
            </div>
          )}

          {error && (
            <div className="cv-preview-error" role="alert">
              <p>{error}</p>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setAttempt((v) => v + 1)}
              >
                Thử lại
              </button>
            </div>
          )}

          {!loading && !error && displaySrc && (
            <iframe
              src={displaySrc}
              title={`Xem trước CV: ${resolvedFilename}`}
              className="cv-preview-iframe"
            />
          )}
        </div>
      </section>
    </div>
  );
}
