import { useEffect, useState } from "react";
import { apiDownload } from "../api/client";
import { Button, Card, ErrorBanner } from "../ui";
import { ExternalLinkIcon } from "./Icon";

export function PdfSource({
  path,
  accessToken,
  filename
}: {
  path: string;
  accessToken: string;
  filename: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | null = null;
    setUrl(null);
    setFailed(false);
    void apiDownload(path, { accessToken, signal: controller.signal })
      .then(({ blob }) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, accessToken, attempt]);

  return (
    <Card padding="md" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-border-subtle">
        <div className="min-w-0">
          <strong className="block text-sm font-bold text-ink-900">CV gốc</strong>
          <small className="block text-xs text-ink-500 truncate max-w-[260px]">{filename}</small>
        </div>
        {url && (
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border-strong bg-white px-2.5 text-xs font-semibold text-ink-800 hover:bg-slate-50 no-underline"
            >
              <ExternalLinkIcon size={13} aria-hidden="true" />
              <span>Mở PDF trong tab mới</span>
            </a>
            <a
              href={url}
              download={filename}
              className="inline-flex h-8 items-center rounded-lg border border-border-strong bg-white px-2.5 text-xs font-semibold text-ink-800 hover:bg-slate-50 no-underline"
            >
              Tải tệp gốc
            </a>
          </div>
        )}
      </div>

      {failed ? (
        <ErrorBanner
          tone="warning"
          message="Chưa tải được tệp gốc. Bạn vẫn có thể kiểm tra thông tin bên cạnh."
          action={
            <Button type="button" size="sm" variant="secondary" onClick={() => setAttempt((value) => value + 1)}>
              Thử lại tệp
            </Button>
          }
        />
      ) : url ? (
        <iframe
          src={url}
          title={`CV gốc: ${filename}`}
          className="w-full h-[640px] rounded-xl border border-border-subtle bg-slate-50"
        />
      ) : (
        <div className="rounded-xl border border-border-subtle bg-slate-50 p-6 text-center text-sm text-ink-500" role="status">
          Đang tải tệp gốc…
        </div>
      )}
    </Card>
  );
}
