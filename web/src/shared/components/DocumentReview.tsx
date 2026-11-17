import { ReactNode } from "react";

export function DocumentReview({
  source,
  children,
  title
}: {
  source: ReactNode;
  children: ReactNode;
  title: string;
}) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      <aside className="xl:col-span-5 xl:sticky xl:top-20 space-y-3" aria-label={title}>
        {source}
      </aside>
      <div className="xl:col-span-7 min-w-0">{children}</div>
    </div>
  );
}
