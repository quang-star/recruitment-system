const boundaries = [
  { name: "Gateway", responsibility: "Routing, JWT edge validation, CORS, correlation ID" },
  { name: "Auth", responsibility: "Identity, credential, global roles, session and token lifecycle" },
  { name: "Core", responsibility: "Candidate, Company, CV metadata, Job and Application workflow" },
  { name: "AI", responsibility: "Parsing, taxonomy, matching, evidence and research artifacts" }
];

export function SystemOverview() {
  return (
    <section aria-labelledby="architecture-title">
      <div className="section-heading">
        <h2 id="architecture-title">Service boundaries</h2>
        <span>Contract v1</span>
      </div>
      <div className="grid">
        {boundaries.map((boundary) => (
          <article key={boundary.name}>
            <h3>{boundary.name}</h3>
            <p>{boundary.responsibility}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
