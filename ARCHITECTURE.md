# Executable architecture baseline

The detailed decisions remain in `docs/09-system-architecture.md` and
`docs/16-api-service-contracts.md`. This file maps those decisions to code.

| Project | Runtime | Owns | Must not own |
|---|---|---|---|
| `web` | React/Vite | Browser UI and feature state | Credentials, business persistence, direct service URLs |
| `gateway-service` | Spring Cloud Gateway WebFlux | Routing, edge JWT validation, CORS, correlation ID | Business logic or database |
| `auth-service` | Spring Boot + jOOQ | Account, credential, global role, JWT and session family | Candidate profile, Company, CV, Job or Application |
| `core-service` | Spring Boot + jOOQ | Candidate/Recruiter profile and recruitment workflow | Password/token, parsing, taxonomy or matching details |
| `ai-service` | FastAPI + SQLAlchemy/Alembic | Parsing, taxonomy, processing task, matching and research records | Credential or recruitment workflow |
| AI worker process | Same AI codebase/image | Kafka event consumption and task execution | Public business API |

## Boundary rules

1. Public IDs are UUIDs. BIGINT IDs stay inside the owning database.
2. Auth, Core and AI use separate database users, migrations and databases.
3. No cross-database foreign keys, joins or generated persistence models.
4. HTTP and event boundaries use versioned artifacts under `contracts/`.
5. JWT consumers validate signature, issuer, expiry and audience.
6. `X-Correlation-Id` is a UUID generated or normalized at the Gateway and propagated downstream.
7. Async messages contain identifiers, versions and private object references—not raw CV/JD, PII or tokens.
8. Auth/Core domain code is framework-free. Only persistence adapters import generated jOOQ records.
9. AI domain/application code does not import FastAPI, SQLAlchemy or Pydantic.
10. Database state and outbox are committed together when event-producing use cases are implemented.

## Kafka conventions

1. Kafka is the asynchronous event backbone; services do not communicate through broker-specific queues or exchanges.
2. Topics are versioned event streams with lowercase dot-separated names, for example `cv.uploaded.v1`.
3. Producers wrap event payloads with `contracts/schemas/event-envelope-v1.schema.json`. The Kafka record key is the aggregate or resource UUID to preserve ordering for that resource.
4. Each consuming service uses its own stable consumer group. Instances of the same service share the group for horizontal scaling.
5. Delivery is at-least-once. Consumers persist processed event IDs in their inbox to make handling idempotent.
6. Failed records use bounded retries followed by a dead-letter topic named `<topic>.dlq`; raw CV/JD, PII and tokens must not appear in error metadata.
7. Producers commit business state and outbox records in one database transaction. An outbox relay publishes to Kafka without coupling domain code to Kafka clients.

## Verification

Run:

```powershell
powershell -File scripts/validate-architecture.ps1
.\auth-service\mvnw.cmd -f pom.xml -DskipTests package
```

The root Maven reactor builds Auth, Gateway and Core. AI and Web remain separate language build units.
