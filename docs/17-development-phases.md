# Development Phases & Delivery Plan

| Thuộc tính | Giá trị |
|---|---|
| Mã tài liệu | DOC-PLAN-001 |
| Phiên bản | 0.2.0 |
| Trạng thái | Working baseline |

## Nguyên tắc

Mỗi phase phải tạo lát cắt chạy và kiểm thử được. Freeze contract trước khi tích hợp nhiều service; luồng cốt lõi chạy không cần external LLM; làm baseline/evaluation sớm, không UI-first.

## Phase 0 — Freeze phạm vi và kiến trúc

Các quyết định phạm vi/kiến trúc đã freeze ngày 2026-07-20: Gateway Java 21 LTS + Spring Boot 4.0.7 + Spring Cloud 2025.1.2/Gateway 5.0.2 WebFlux; Auth, Core, AI API/Worker, một PostgreSQL server với ownership logic riêng, RabbitMQ, MinIO + local fallback, Docker Compose; Việt/Anh/mixed, PDF text ≤10 MB, OCR ngoài MVP và LLM là Should. Đầu ra còn lại: diagram, API/event v1, backlog dependency. Gate: mỗi entity có đúng một owner và không còn câu hỏi làm đổi service boundary.

## Phase 1 — Skeleton và hạ tầng local

Tạo `gateway`, `auth-service`, `core-service`, `ai-service`, `web`; health/readiness, structured log/correlation, migration/credential riêng, RabbitMQ/DLQ, MinIO private bucket và OpenAPI. Gate: `docker compose up`/smoke test pass, không shared DB credential/secret, Core/AI không public trực tiếp.

## Phase 2 — Identity và authorization

Làm register/login/refresh/logout, hashing, refresh rotation/revoke, JWT bất đối xứng/JWKS, role Candidate/Recruiter/Admin và Core ownership. Gate: token sai/expired/revoked, cross-user và cross-company đều bị chặn; Gateway không phải điểm authorize duy nhất.

## Phase 3 — Data contract, dataset và baseline

Freeze ParsedCV/ParsedJD/taxonomy/evidence/MatchingResult schema v1; registry nguồn/license/consent/PII/checksum/split; taxonomy seed, annotation pilot, lexical/rule baseline. Gate: fixture Việt/Anh/mixed validate, final test không dùng chọn model/weight, baseline chạy trước hybrid.

## Phase 4 — CV/JD ingestion và parsing async

Core upload PDF → MinIO → outbox → RabbitMQ → idempotent Worker; extract/language/PII separation/parse/normalize; task/retry/DLQ/UI; ParsedCV/JD review/revision/confirm. Gate: duplicate không tạo bản logic mới, message/log không raw PII, worker failure/retry có test.

## Phase 5 — Recruitment Core workflow

Làm Company/member/profile; Job DRAFT → PUBLISHED → CLOSED; Application SUBMITTED/UNDER_REVIEW/SHORTLISTED/REJECTED/WITHDRAWN, submit/list/detail/status/withdraw; locking/idempotency/audit và UI tối thiểu. Gate: Core vẫn dùng được khi AI lỗi, unique Candidate–Job chặn mọi re-apply, terminal state không chuyển tiếp, transition conflict rõ.

## Phase 6 — Hybrid matching và explanation

Benchmark embedding multilingual; rule components + semantic evidence; versioned aggregation/penalty; immutable result/ranking/template explanation/flags; so sánh rule-only, lexical, embedding-only, hybrid cùng split. Gate: factual claim trỏ evidence, version tuple idempotent, result cũ immutable, embedding lỗi có degraded policy.

## Phase 7 — Taxonomy Admin và reprocessing

Làm PendingSkill/local candidates, approve/edit/merge/reject/defer/audit/publish, stale/impact/batch reprocess. LLM proposal chỉ làm sau local workflow. Gate: LLM không auto-approve/nhận raw PII; publish không sửa result cũ.

## Phase 8 — Hardening, evaluation và bảo vệ

Chạy contract/integration/E2E/security/fault/load tests; freeze test data; parsing/matching/ablation/explanation/taxonomy experiments; benchmark 1 vs 2 worker; report/demo/rehearsal/video backup. Gate: fresh setup chạy trên máy demo, Must E2E, không critical security/privacy bug và claim khớp evidence.

## Vertical slices khuyến nghị

| Slice | Demo | Phần tối thiểu |
|---:|---|---|
| 1 | Login qua Gateway | Auth + JWT + route + RBAC |
| 2 | Upload CV/thấy trạng thái | Core CV + MinIO + outbox + worker stub |
| 3 | Review ParsedCV | Parser v0 + AI revision/confirm |
| 4 | Tạo/publish Job | Core Job + ParsedJD confirm |
| 5 | Ứng tuyển khi AI down | Application + audit + resilience |
| 6 | Matching có evidence | Components + immutable result + explanation |
| 7 | Applicant ranking | Ranking API + pending visibility |
| 8 | Admin xử lý unknown skill | Taxonomy version + reprocess |

## Cắt scope khi trễ

Cắt lần lượt: LLM rewrite, LLM taxonomy proposal, UI bulk reprocess, dashboard/notification/polish, load test lớn. Không cắt baseline, dataset/versioning, evidence explanation, evaluation, authorization, idempotency và hai luồng Candidate/Recruiter E2E.

## Mốc tiến độ đã chốt

- Hoàn thành feature MVP kỹ thuật trước **2026-08-31**.
- Tháng 9/2026 dành cho hardening, evaluation, báo cáo, rehearsal và public VPS sau khi local ổn định.
- Máy baseline: i5-11300H, RAM 16 GB, GTX 1650; một instance/service, một node PostgreSQL/RabbitMQ/MinIO và không chạy local LLM lớn.

## Definition of Done mỗi phase

- Code/migration/config mẫu đã review và test phù hợp rủi ro pass.
- OpenAPI/event/schema/traceability cập nhật.
- Không log raw CV/token/secret; không commit `.env` thật.
- Có lệnh chạy tái lập, artifact đầu ra và ghi rõ limitation/failing check.

