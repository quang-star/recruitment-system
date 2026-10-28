import { useEffect, useState } from "react";
import { apiDownload } from "../api/client";

export function PdfSource({ path, accessToken, filename }: { path: string; accessToken: string; filename: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | null = null;
    setUrl(null); setFailed(false);
    void apiDownload(path, { accessToken, signal: controller.signal }).then(({ blob }) => {
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [path, accessToken, attempt]);
  return <div className="pdf-source">
    <div className="document-source-heading"><strong>CV gốc</strong><small>{filename}</small></div>
    {failed ? <p role="alert">Chưa tải được tệp gốc. Bạn vẫn có thể kiểm tra thông tin bên cạnh. <button type="button" className="secondary-button" onClick={() => setAttempt((value) => value + 1)}>Thử lại tệp</button></p>
      : url ? <><div className="button-row"><a href={url} target="_blank" rel="noopener noreferrer">Mở PDF trong tab mới</a><a href={url} download={filename}>Tải tệp gốc</a></div><iframe src={url} title={`CV gốc: ${filename}`} /></>
      : <p role="status">Đang tải tệp gốc…</p>}
  </div>;
}
