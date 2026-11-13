import { Button } from "../ui";

type Props = { page: number; size: number; total: number; loading: boolean; onPageChange: (page: number) => void; label: string };

export function PageControls({ page, size, total, loading, onPageChange, label }: Props) {
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <nav
      aria-label={label}
      className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-border-subtle/80"
    >
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={loading || page === 0}
        onClick={() => onPageChange(page - 1)}
      >
        Trang trước
      </Button>
      <span className="text-xs sm:text-sm font-medium text-ink-600 tabular-nums-kpi">
        {loading ? "Đang tải…" : `Trang ${page + 1}/${pages} · ${total} kết quả`}
      </span>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={loading || page + 1 >= pages}
        onClick={() => onPageChange(page + 1)}
      >
        Trang sau
      </Button>
    </nav>
  );
}
