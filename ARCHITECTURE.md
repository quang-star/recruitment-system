# Executable architecture baseline

This file is the canonical, versioned architecture baseline for the codebase.
Material under the ignored `docs/` working directory may provide design context,
but it must not override this file. In particular, Kafka supersedes older
broker references that may still exist in local working notes.

Thesis title confirmed by the author on 2026-09-07: **Nghiên cứu, thiết kế và phát triển hệ thống tuyển dụng thông minh dựa trên kiến trúc Microservices và AI**.

| Project | Runtime | Owns | Must not own |
|---|---|---|---|
| `web` | React/Vite | Browser UI and feature state | Credentials, business persistence, direct service URLs |
| `gateway-service` | Spring Cloud Gateway WebFlux | Routing, edge JWT validation, CORS, correlation ID | Business logic or database |
| `auth-service` | Spring Boot + jOOQ | Account, credential, global role, JWT and session family | Candidate profile, Company, CV, Job or Application |
| `core-service` | Spring Boot + jOOQ | Candidate/Recruiter profile, recruitment workflow, job category catalog and CV access/erasure | Password/token, parsing, skill taxonomy or matching algorithm |
| `ai-service` | FastAPI + SQLAlchemy/Alembic | Parsing, taxonomy, processing task, matching and research records | Credential or recruitment workflow |
| AI worker process | Same AI codebase/image | Kafka event consumption and task execution | Public business API |

Implementation status as of the 2026-09-07 source review: `ai-service/start.sh`
starts the worker and API as separate processes in the same container. Independent
worker deployment/scaling is a proposed improvement, not a verified capability.
As of 2026-10-02, public matching uses deterministic rule/keyword baseline-v5 with relevant,
non-overlapping experience intervals and conservative language proficiency checks.
Results record CV/JD revision IDs and the calculation month; skill claims carry source
page/text offsets. Confirmed unfamiliar skills are scoped to the JobVersion and
require exact names plus CV source evidence to count as hits. SYSTEM_ADMIN can
create/edit/approve/merge/reject/defer/reopen job categories and skills with required
reasons, optimistic versions and before/after history. Skill type/category and
relations are validated at the AI boundary. Review CAS versions and published
taxonomy versions are separate; only changed ACTIVE definitions publish immutable
snapshots for new parses. Historical inputs/results remain unchanged. A complete
occurrence ledger, local suggestion candidates/audit, career classification
suggestions and controlled reprocessing are now implemented (B2/B3/B4/C1).
Reprocessing creates reviewable revisions and preserves immutable application
snapshots; external suggestions remain optional, consent/budget gated and
subject to manual confirmation. Current release gates and their limitations
are recorded in docs/45-release-readiness-2026-10-07.md.
Parsers retain source locations beyond skills
where available and report partial evidence when locations cannot be resolved.
AI API/worker events use a transactional outbox. Storage read failures use bounded
retries without publishing an early FAILED projection; persistence failures roll
back for Kafka retry. Candidate-owned transient CV failures can be retried
through Core with an atomic queue/outbox write, optimistic concurrency and a
processing generation fencing old commands/results; the same file and source
version are retained, and successful parsing still requires user confirmation.
Core classification snapshots permit manual publication/application outside IT
without ParsedJD or an AI score/ranking; backend guards enforce this boundary.
Candidate erasure/revocation/withdrawal immediately blocks related PDF/score
access; durable erasure queues and AI tombstones remove derived data and prevent
late results from restoring it. Core owns job categories; AI owns skill taxonomy.
Frontend singleflight refresh uses existing Auth rotation and preserves drafts
on transient errors. Account/company suspension and Admin DLQ/retry screens are
deferred from the first release.
The worker can record local semantic/hybrid shadow results with pinned embedding
revision, input/taxonomy lineage and baseline fallback. Shadow does not replace
public scoring; independently annotated evaluation and selection of weights or
the primary matching method remain work items.
PostgreSQL/Compose runtime gates require a running Docker engine.
An offline research runner now compares baseline, pinned multilingual MiniLM embeddings
and a fixed 80/20 hybrid; it does not replace production scoring or supply human labels.
The rules below state architectural invariants;
their presence in this document is not proof that every runtime path satisfies them.

## Boundary rules

1. Each business entity has one positive signed BIGINT identity, assigned by its owning database. HTTP v2, JWT subjects and v2 event payloads carry decimal ID strings so JavaScript preserves all 64 bits. IDs are scoped by service and entity type; CV version 1 and JD version 1 are distinct resources. UUIDs remain for technical event, correlation, evidence and lease identifiers. There is no second `public_id` on business tables.
2. Auth, Core and AI use separate database users, migrations and databases.
3. No cross-database foreign keys, joins or generated persistence models.
4. HTTP and event boundaries use versioned artifacts under `contracts/`.
5. JWT consumers validate signature, issuer, expiry and audience.
   Auth signing keys are persistent PEM secrets mounted read-only; they are never generated per process start.
6. `X-Correlation-Id` is a UUID generated or normalized at the Gateway and propagated downstream.
7. Async messages contain identifiers, versions and private object references—not raw CV/JD, PII or tokens.
8. Auth/Core domain code is framework-free. Only persistence adapters import generated jOOQ records.
9. AI domain/application code does not import FastAPI, SQLAlchemy or Pydantic.
10. Database state and outbox are committed together when event-producing use cases are implemented.
11. Base Compose exposes only Web and Gateway. Infrastructure debug ports belong in `compose.dev.yaml`.

Taxonomy skill allocation is serialized by the catalog-head lock and respects
the archived AI skill mappings, including historical claims absent from the
current catalog. Canonical skill IDs use the lower positive BIGINT range;
transient job-local claim IDs use the upper half so they cannot alias catalog IDs.

## Kafka conventions

1. Kafka is the asynchronous event backbone; services do not communicate through broker-specific queues or exchanges.
2. Topics are versioned event streams with lowercase dot-separated names, for example `cv.uploaded.v2`. The v1 contracts remain historical artifacts; v1 UUID messages must be drained before the coordinated identity upgrade.
3. Producers wrap event payloads with `contracts/schemas/event-envelope-v2.schema.json`. The Kafka record key is the decimal aggregate/resource ID, scoped by its topic, to preserve ordering for that resource.
4. Each consuming service uses its own stable consumer group. Instances of the same service share the group for horizontal scaling.
5. Delivery is at-least-once. Consumers persist processed event IDs in their inbox to make handling idempotent.
6. Failed records use bounded retries followed by a dead-letter topic named `<topic>.dlq`; raw CV/JD, PII and tokens must not appear in error metadata.
7. Producers commit business state and outbox records in one database transaction. An outbox relay publishes to Kafka without coupling domain code to Kafka clients.

## Verification

External CV/JD extraction uses `ExtractionProvider` with provider-neutral
grounding/schema validation in `SourceExtractor` and Groq/Gemini transports.
The worker uses `get_extractor`, which requires document-version consent with
the current notice and reserves durable global/user daily budgets before an
outbound call. Missing consent, unavailable budget, quota or API failure keeps
local parsing and human review. No automatic cross-provider failover is used.
Professional section filtering and contact masking are best effort, not complete
anonymization. Audit stores metadata only. Diagnostic commands use synthetic
data and direct transports; they are outside the worker budget path.
Groq is the current default provider selection; provider enablement remains off
by default and the model is configurable for later comparison. No live provider
quality claim follows from mock transport tests.
The verified B1 snapshot has Auth Flyway V1–V4, Core V1–V21 and AI Alembic 0001–0015.
Core V16 persists consent, V17–V20 add category/snapshot/privacy behavior; AI
0010–0014 add budgets, skill catalog, tombstones, shadow and taxonomy payloads.
The isolated QA reports cover these migrations and 85 Core tests, 323 AI tests
(one optional NumPy skip covered separately on the host), 62 Web tests and 15
Chromium scenarios. A later scoped provider/policy run passed 63 tests. These
are earlier functional verification results, not tests rerun for documentation
synchronization or proof of accuracy, SLA, public readiness or a clean-machine
handoff. See the current status table in docs/34-current-status-and-traceability.md;
ignored docs/evidence must be included in the separate handoff backup.

The subsequent 2026-10-02 hardening run moved CV privacy and erasure SQL into
persistence adapters behind application ports. New submissions lock the owned
active CV before reading a snapshot, using the same parent-first lock order as
erasure. Erasure timestamps preserve existing lifecycle ordering when clocks
differ. AI task persistence normalizes domain timestamps to UTC while preserving
legacy SQLite local wall-time storage. Python and PowerShell architecture gates,
130 Java tests (105 Core, 21 Auth, 4 Gateway), 331 AI/contract tests and 62 Web tests
passed; Java/Web builds and scoped Python typing also passed. Whole-AI typing and
E2E have separate limitations documented in
docs/35-architecture-privacy-hardening-2026-10-02.md; no live extraction provider
or recruitment accuracy was evaluated in this run.

The following A1 run fixed the remaining 23 AI mypy errors. Full mypy passed
for 53 source files using the existing import-checking flags and typed Pydantic
constructor plugin; Ruff and 352 AI/contracts tests on isolated PostgreSQL passed
without skips. Required settings and revision status validation remain enforced.
See docs/37-ai-typecheck-completion-2026-10-02.md for scope and evidence.
The subsequent A2 baseline passed 15 Chromium scenarios without skips/retries
and verified physical PDF/AI cleanup; see docs/38-e2e-baseline-2026-10-02.md.

B1 added deferred review, required mutation reasons and nullable legacy audit
metadata in Core V21/AI 0015. Deferred names/aliases remain reserved; proposal
creation under a deferred category parent preserves the manual Job workflow.
Core kind/parent remain immutable. AI validates ACTIVE relation targets,
hierarchy/supersession cycles and aliases; RELATED is not constrained as a DAG.
Core 117, isolated PostgreSQL AI/contracts 388 and Web 68 tests passed; full
mypy passed for 54 source files, with Ruff, TypeScript/Vite and Core/AI/Web
image builds passing. The final B1 Chromium run passed 15 scenarios with no
failures/skips/retries, and PDF/AI erasure checks passed for three cumulative
synthetic CV versions. See docs/39-admin-review-b1-2026-10-02.md. This historical
B1 run did not cover the subsequent B2/B3/B4/C1 implementation; see docs/40–43
and the current release report rather than interpreting B1 as current scope.

The 2026-10-07 release checks passed architecture, 177 Java tests (21 Auth,
4 Gateway, 152 Core), 616 guarded AI/contracts tests on disposable PostgreSQL
(no skips), Ruff, full AI mypy (74 source files), 121 Web tests, TypeScript and
Java/Web packaging. Web has no configured lint script. Explicitly authorized
isolated QA passed 18 Chromium scenarios without skips/retries, 14 controlled
reprocessing checks and physical PDF/AI erasure verification. Candidate and
Recruiter PDF endpoints now stream synchronously through InputStreamResource
to avoid the reproduced async response/header failure. See docs/48 for scope
and evidence; no production readiness or clean-machine claim is made. A local-only
baseline-v5/semantic/hybrid comparison completed on 20 synthetic CVs and four
IT JDs (80 pairs, 64 test pairs). Its model-authored reference labels are
diagnostic only; agreement is not reported as independent human evidence,
and public scoring remains baseline-v5. The local model loader resolves the
pinned cache snapshot before initializing the tokenizer. No external provider
or real-document quality evaluation was performed. See docs/45 for artifacts,
protocol and remaining gates; ignored documents/evidence require separate backup.

The 2026-10-14 parser update is rules-v0.5.4: additional Vietnamese/English
section headings, responsibility/title separation and whole-word role matching
preserve raw engineering titles without substring canonicalization. Predominantly
CJK documents retain unknown language under the existing contract. Current checks
passed 638 AI/contracts tests on disposable PostgreSQL, 177 Java and 121 Web
tests, 18 Chromium scenarios without skips/retries, Ruff, mypy, TypeScript and
build/package gates. A frozen local 200-PDF pool (150 dev/50 test) produced 150
embedded-text and 50 OCR schema-valid payloads with no dangling evidence IDs;
this is coverage, not independently labeled extraction accuracy. The 1,000-pair
annotation kit remains unlabeled. Reprocessing and physical erasure passed on
the initial QA run; the final follow-up was blocked, then QA was observed
stopped. See docs/49 for exact verification scope and remaining product gates.

Run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validate-architecture.ps1
.\auth-service\mvnw.cmd -f pom.xml -DskipTests package
```

The root Maven reactor builds Auth, Gateway and Core. AI and Web remain separate language build units.
