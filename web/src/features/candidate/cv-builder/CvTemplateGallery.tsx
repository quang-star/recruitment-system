import { useEffect, useMemo, useRef, useState } from "react";
import { ACCENT_PRESETS, type TemplateId } from "./cvDocument";
import { CvLivePreview } from "./CvLivePreview";
import {
  createSampleCvDocument,
  CV_TEMPLATE_CATALOG,
  TEMPLATE_FILTER_TAGS,
  type CvTemplateCatalogItem,
  type TemplateFilterTag,
} from "./cvTemplates";

type Props = {
  onSelectTemplate: (templateId: TemplateId, accentColor: string) => void;
  title?: string;
  description?: string;
  compact?: boolean;
};

const PREVIEW_CANVAS_WIDTH = 560;

function TemplateMiniPreview({ item, accentColor }: { item: CvTemplateCatalogItem; accentColor: string }) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0.44);

  useEffect(() => {
    const node = frameRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const update = () => {
      const width = node.clientWidth;
      if (width > 0) setScale(width / PREVIEW_CANVAS_WIDTH);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const sampleDoc = useMemo(
    () => createSampleCvDocument(item.id, accentColor),
    [item.id, accentColor],
  );

  return (
    <div
      ref={frameRef}
      aria-hidden="true"
      className="relative aspect-[210/280] w-full overflow-hidden rounded-lg border border-border-subtle bg-slate-100 pointer-events-none select-none"
    >
      <div
        style={{
          width: `${PREVIEW_CANVAS_WIDTH}px`,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
        className="absolute top-0 left-0"
      >
        <CvLivePreview doc={sampleDoc} />
      </div>
    </div>
  );
}

export function CvTemplateGallery({
  onSelectTemplate,
  title = "Thư viện mẫu CV",
  description = "Xem trực quan từng bố cục, thử màu nhấn trực tiếp trên mẫu và chọn nguồn nội dung để bắt đầu.",
  compact = false,
}: Props) {
  const [activeTag, setActiveTag] = useState<TemplateFilterTag>("Tất cả");
  const [selectedColors, setSelectedColors] = useState<Record<TemplateId, string>>(() => ({
    executive: CV_TEMPLATE_CATALOG[0].defaultAccent,
    modern: CV_TEMPLATE_CATALOG[1].defaultAccent,
    classic: CV_TEMPLATE_CATALOG[2].defaultAccent,
    minimal: CV_TEMPLATE_CATALOG[3].defaultAccent,
  }));

  const visibleTemplates = useMemo(() => {
    if (activeTag === "Tất cả") return CV_TEMPLATE_CATALOG;
    return CV_TEMPLATE_CATALOG.filter(item => item.tags.includes(activeTag));
  }, [activeTag]);

  return (
    <section aria-label={title} className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="m-0 text-base font-bold text-ink-900">{title}</h3>
          {!compact && <p className="m-0 mt-0.5 text-xs text-ink-500">{description}</p>}
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lọc mẫu CV theo phong cách">
          {TEMPLATE_FILTER_TAGS.map(tag => {
            const active = activeTag === tag;
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={active}
                onClick={() => setActiveTag(tag)}
                className={`rounded-md border px-3 py-1 text-xs font-medium transition cursor-pointer ${
                  active
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-border-subtle bg-white text-ink-700 hover:border-border-strong hover:bg-slate-50"
                }`}
              >
                {tag}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {visibleTemplates.map(item => {
          const accent = selectedColors[item.id];
          return (
            <article
              key={item.id}
              className="group flex flex-col overflow-hidden rounded-lg border border-border-subtle bg-white p-3 shadow-2xs transition hover:border-brand-400 hover:shadow-md"
            >
              <button
                type="button"
                onClick={() => onSelectTemplate(item.id, accent)}
                className="relative block w-full overflow-hidden rounded-lg text-left focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
                aria-label={`Xem trước mẫu ${item.title}`}
              >
                <TemplateMiniPreview item={item} accentColor={accent} />
                <div className="pointer-events-none absolute inset-0 flex items-end justify-center bg-gradient-to-t from-slate-900/55 via-slate-900/10 to-transparent p-3 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                  <span className="rounded-md bg-brand-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm">
                    Xem trước & Dùng mẫu
                  </span>
                </div>
              </button>

              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-1.5" role="group" aria-label={`Màu nhấn mẫu ${item.title}`}>
                  {ACCENT_PRESETS.map(preset => {
                    const active = accent === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        aria-label={`Chọn màu ${preset.label} cho mẫu ${item.title}`}
                        aria-pressed={active}
                        onClick={() =>
                          setSelectedColors(prev => ({
                            ...prev,
                            [item.id]: preset.id,
                          }))
                        }
                        className={`h-4.5 w-4.5 rounded-full border transition cursor-pointer ${
                          active
                            ? "scale-110 border-ink-900 ring-2 ring-brand-500/40"
                            : "border-black/15 hover:scale-105"
                        }`}
                        style={{ backgroundColor: preset.id }}
                      />
                    );
                  })}
                </div>

                <div>
                  <button
                    type="button"
                    onClick={() => onSelectTemplate(item.id, accent)}
                    className="m-0 block w-full truncate bg-transparent p-0 text-left text-sm font-bold text-ink-900 hover:text-brand-700 cursor-pointer"
                  >
                    {item.title}
                  </button>
                  <p className="m-0 mt-0.5 text-xs text-ink-500">{item.subtitle}</p>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {item.tags.map(tag => (
                    <span
                      key={tag}
                      className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-ink-700"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
