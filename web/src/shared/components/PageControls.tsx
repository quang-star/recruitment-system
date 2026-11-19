import { Button } from "../ui";
import { cn } from "../ui/cn";

type Props = {
  page: number;
  size: number;
  total: number;
  loading: boolean;
  onPageChange: (page: number) => void;
  label: string;
};

type PageToken = number | "ellipsis";

function buildPageTokens(current: number, totalPages: number): PageToken[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  const visible = new Set<number>([1, totalPages]);
  if (current <= 3) {
    visible.add(2);
    visible.add(3);
    visible.add(4);
  } else if (current >= totalPages - 2) {
    visible.add(totalPages - 3);
    visible.add(totalPages - 2);
    visible.add(totalPages - 1);
  } else {
    visible.add(current - 1);
    visible.add(current);
    visible.add(current + 1);
  }
  const sorted = Array.from(visible).sort((a, b) => a - b);
  const tokens: PageToken[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) {
      tokens.push("ellipsis");
    }
    tokens.push(sorted[i]);
  }
  return tokens;
}

export function PageControls({ page, size, total, loading, onPageChange, label }: Props) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (!loading && pages <= 1) {
    return null;
  }
  const current = Math.min(Math.max(1, page + 1), pages);
  const tokens = buildPageTokens(current, pages);

  return (
    <nav
      aria-label={label}
      className="flex flex-col gap-3 border-t border-border-subtle/80 pt-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <span className="text-xs sm:text-sm font-medium text-ink-600 tabular-nums-kpi">
        {loading ? "Đang tải…" : `Trang ${current}/${pages} · ${total} kết quả`}
      </span>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Điều hướng trang">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={loading || page === 0}
          onClick={() => onPageChange(page - 1)}
          className="px-2.5"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
          <span>Trang trước</span>
        </Button>

        {tokens.map((token, index) =>
          token === "ellipsis" ? (
            <span
              key={`ellipsis-${index}`}
              aria-hidden="true"
              className="inline-flex h-8 min-w-7 items-center justify-center px-1 text-xs font-medium text-ink-400 select-none"
            >
              …
            </span>
          ) : (
            <button
              key={token}
              type="button"
              disabled={loading}
              aria-label={`Trang ${token}`}
              aria-current={token === current ? "page" : undefined}
              onClick={() => {
                if (token !== current) onPageChange(token - 1);
              }}
              className={cn(
                "inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-xs font-semibold tabular-nums-kpi transition-colors cursor-pointer disabled:cursor-not-allowed",
                token === current
                  ? "border-brand-600 bg-brand-600 text-white shadow-xs"
                  : "border-border-strong bg-white text-ink-700 hover:bg-slate-50 hover:text-ink-900 disabled:opacity-50"
              )}
            >
              {token}
            </button>
          )
        )}

        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={loading || page + 1 >= pages}
          onClick={() => onPageChange(page + 1)}
          className="px-2.5"
        >
          <span>Trang sau</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </Button>
      </div>
    </nav>
  );
}
