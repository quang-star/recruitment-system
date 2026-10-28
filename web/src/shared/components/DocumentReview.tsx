import { ReactNode } from "react";

export function DocumentReview({ source, children, title }: { source: ReactNode; children: ReactNode; title: string }) {
  return <div className="document-review-layout">
    <aside className="document-review-source" aria-label={title}>{source}</aside>
    <div className="document-review-editor">{children}</div>
  </div>;
}
