type Props = { page: number; size: number; total: number; loading: boolean; onPageChange: (page: number) => void; label: string };

export function PageControls({ page, size, total, loading, onPageChange, label }: Props) {
  const pages = Math.max(1, Math.ceil(total / size));
  return <nav className="page-controls" aria-label={label}>
    <button type="button" className="secondary-button" disabled={loading || page === 0}
      onClick={() => onPageChange(page - 1)}>Trang trước</button>
    <span>{loading ? "Đang tải…" : `Trang ${page + 1}/${pages} · ${total} kết quả`}</span>
    <button type="button" className="secondary-button" disabled={loading || page + 1 >= pages}
      onClick={() => onPageChange(page + 1)}>Trang sau</button>
  </nav>;
}
