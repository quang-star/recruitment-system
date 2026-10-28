import { FC } from "react";
import { LayersIcon, SecurityIcon, SparklesIcon, JobsIcon } from "../../shared/components/Icon";

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
    <section className="architecture-showcase" aria-labelledby="architecture-title">
      <div className="section-heading">
        <div>
          <span className="tech-tag-accent">MICROSERVICES ARCHITECTURE</span>
          <h2 id="architecture-title">Service boundaries</h2>
        </div>
        <span className="contract-pill">Contract v1 · Event-Driven (Kafka)</span>
      </div>
      <div className="grid architecture-grid">
        {boundaries.map((boundary) => {
          const IconComp = boundary.icon;
          return (
            <article key={boundary.name} className="service-card">
              <div className="service-card-header">
                <span className="service-icon-box">
                  <IconComp size={20} />
                </span>
                <div>
                  <h3>{boundary.name}</h3>
                  <small className="service-tech">{boundary.tech}</small>
                </div>
                <span className="service-badge">{boundary.badge}</span>
              </div>
              <p className="service-desc">{boundary.responsibility}</p>
            </article>
          );
        })}
      </div>
      <div className="architecture-footer-note">
        <LayersIcon size={16} />
        <span>Hệ thống phân tán: 3 Database PostgreSQL độc lập, giao tiếp bất đồng bộ qua Kafka KRaft và Transactional Outbox Pattern.</span>
      </div>
    </section>
  );
}
