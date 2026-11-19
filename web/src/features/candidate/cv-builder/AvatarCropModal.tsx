import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Button, ErrorBanner, Modal } from "../../../shared/ui";
import { isSafeCvPhotoDataUrl, MAX_PHOTO_UPLOAD_BYTES } from "./cvDocument";

type Props = {
  file: File | null;
  onCancel: () => void;
  onConfirm: (dataUrl: string) => void;
};

const CANVAS_SIZE = 240;
const EXPORT_SIZE = 240;

export function AvatarCropModal({ file, onCancel, onConfirm }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragOrigin = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1.1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setImg(null);
      setError(null);
      return;
    }
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError("Chỉ hỗ trợ ảnh đại diện định dạng PNG, JPG hoặc WebP.");
      return;
    }
    if (file.size > MAX_PHOTO_UPLOAD_BYTES) {
      setError("Ảnh đại diện vượt quá 5 MiB. Vui lòng chọn ảnh nhỏ hơn.");
      return;
    }
    setError(null);
    setZoom(1.1);
    setPan({ x: 0, y: 0 });
    setRotation(0);

    const url = URL.createObjectURL(file);
    let active = true;
    const image = new Image();
    image.onload = () => {
      if (active) setImg(image);
    };
    image.onerror = () => {
      if (active) setError("Không đọc được file ảnh này.");
    };
    image.src = url;
    return () => {
      active = false;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  const drawIntoCanvas = (target: HTMLCanvasElement, size: number) => {
    if (!img) return;
    const ctx = target.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);

    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const baseScale = size / Math.min(w, h);
    const scale = baseScale * zoom;

    ctx.save();
    ctx.translate(size / 2 + (pan.x * size) / CANVAS_SIZE, size / 2 + (pan.y * size) / CANVAS_SIZE);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(scale, scale);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  };

  useEffect(() => {
    if (canvasRef.current && img) {
      drawIntoCanvas(canvasRef.current, CANVAS_SIZE);
    }
  });

  function handlePointerDown(event: PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragOrigin.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
  }

  function handlePointerMove(event: PointerEvent<HTMLCanvasElement>) {
    if (!dragOrigin.current) return;
    const dx = event.clientX - dragOrigin.current.x;
    const dy = event.clientY - dragOrigin.current.y;
    setPan({
      x: Math.max(-140, Math.min(140, dragOrigin.current.panX + dx)),
      y: Math.max(-140, Math.min(140, dragOrigin.current.panY + dy)),
    });
  }

  function handlePointerUp() {
    dragOrigin.current = null;
  }

  function handleConfirm() {
    if (!img) return;
    const out = document.createElement("canvas");
    out.width = EXPORT_SIZE;
    out.height = EXPORT_SIZE;
    drawIntoCanvas(out, EXPORT_SIZE);
    let dataUrl = out.toDataURL("image/jpeg", 0.86);
    if (!isSafeCvPhotoDataUrl(dataUrl)) {
      dataUrl = out.toDataURL("image/jpeg", 0.68);
    }
    if (!isSafeCvPhotoDataUrl(dataUrl)) {
      setError("Ảnh sau khi cắt vẫn vượt giới hạn lưu trữ. Hãy thử thu gọn ảnh.");
      return;
    }
    onConfirm(dataUrl);
  }

  return (
    <Modal
      open={Boolean(file)}
      onClose={onCancel}
      title="Cắt & căn chỉnh ảnh đại diện"
      description="Kéo ảnh để căn chính giữa khuôn mặt, phóng to/thu nhỏ hoặc xoay góc 90°."
      size="sm"
    >
      <div className="space-y-4 py-3">
        {error && <ErrorBanner message={error} />}

        <div className="flex flex-col items-center gap-3">
          <div className="relative h-60 w-60 overflow-hidden rounded-lg border border-border-strong bg-slate-100">
            <canvas
              ref={canvasRef}
              width={CANVAS_SIZE}
              height={CANVAS_SIZE}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className="h-60 w-60 cursor-grab touch-none active:cursor-grabbing"
              aria-label="Khung cắt ảnh đại diện"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-4 rounded-full border-2 border-dashed border-white/90 shadow-[0_0_0_999px_rgba(15,23,42,0.35)]"
            />
          </div>

          <div className="w-full space-y-2 text-xs">
            <label className="flex items-center justify-between gap-3 font-medium text-ink-700">
              <span>Phóng to ({zoom.toFixed(1)}x)</span>
              <input
                type="range"
                min={1}
                max={3}
                step={0.1}
                value={zoom}
                aria-label="Thu phóng ảnh đại diện"
                onChange={e => setZoom(Number(e.target.value))}
                className="w-40 accent-brand-600"
              />
            </label>
            <div className="flex items-center justify-between gap-2">
              <Button size="sm" variant="secondary" onClick={() => setRotation(r => (r + 90) % 360)}>
                ↻ Xoay 90°
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setZoom(1.1);
                  setPan({ x: 0, y: 0 });
                  setRotation(0);
                }}
              >
                Đặt lại vị trí
              </Button>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border-subtle pt-3">
          <Button size="sm" variant="secondary" onClick={onCancel}>
            Hủy
          </Button>
          <Button size="sm" variant="primary" disabled={!img || Boolean(error)} onClick={handleConfirm}>
            Áp dụng ảnh thẻ
          </Button>
        </div>
      </div>
    </Modal>
  );
}
