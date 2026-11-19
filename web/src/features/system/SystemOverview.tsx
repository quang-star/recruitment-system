import { FC } from "react";
import { JobsIcon, LayersIcon, SecurityIcon, SparklesIcon } from "../../shared/components/Icon";
import { Badge, Card } from "../../shared/ui";

type BoundaryItem = {
  name: string;
  badge: string;
  tech: string;
  responsibility: string;
  icon: FC<{ size?: number }>;
};

const boundaries: BoundaryItem[] = [
  {
    name: "Gateway",
    badge: "Edge Routing",
    tech: "Spring Cloud Gateway · WebFlux",
    responsibility: "Routing, JWT edge validation, CORS, correlation ID",
    icon: SecurityIcon
  },
  {
    name: "Auth",
    badge: "Identity & Tokens",
    tech: "Spring Boot · jOOQ · auth_db",
    responsibility: "Identity, credential, global roles, session and token lifecycle",
    icon: SecurityIcon
  },
  {
    name: "Core",
    badge: "Recruitment Workflow",
    tech: "Spring Boot · jOOQ · core_db",
    responsibility: "Candidate, Company, CV metadata, Job and Application workflow",
    icon: JobsIcon
  },
  {
    name: "AI",
    badge: "Intelligent Matching",
    tech: "FastAPI · PyTorch · ai_db",
    responsibility: "Parsing, taxonomy, matching, evidence and research artifacts",
    icon: SparklesIcon
  }
];

export function SystemOverview() {
  return (
    <section
      className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-12 space-y-6"
      aria-labelledby="architecture-title"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between border-t border-border-subtle pt-8">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-brand-700">
            MICROSERVICES ARCHITECTURE
          </span>
          <h2 id="architecture-title" className="text-xl font-bold tracking-tight text-ink-900 mt-1 mb-0">
            Service boundaries
          </h2>
        </div>
        <Badge tone="brand">Contract v2 · Event-Driven (Kafka)</Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {boundaries.map((boundary) => {
          const IconComp = boundary.icon;
          return (
            <Card key={boundary.name} as="article" padding="md" className="flex flex-col justify-between gap-3">
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-700">
                      <IconComp size={18} />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-base font-bold text-ink-900 m-0">{boundary.name}</h3>
                      <small className="block text-[11px] text-ink-500 truncate">{boundary.tech}</small>
                    </div>
                  </div>
                </div>
                <Badge tone="neutral">{boundary.badge}</Badge>
                <p className="text-xs sm:text-sm text-ink-600 leading-relaxed m-0">
                  {boundary.responsibility}
                </p>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="flex items-center gap-2.5 rounded-lg border border-border-subtle bg-slate-50 px-4 py-3 text-xs sm:text-sm text-ink-600">
        <LayersIcon size={16} aria-hidden="true" />
        <span>
          Hệ thống phân tán: 3 Database PostgreSQL độc lập, giao tiếp bất đồng bộ qua Kafka KRaft và Transactional Outbox Pattern.
        </span>
      </div>
    </section>
  );
}
