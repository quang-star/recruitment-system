# Service Responsibilities & API Contracts

| Thuộc tính | Giá trị |
|---|---|
| Mã tài liệu | DOC-API-001 |
| Phiên bản | 0.2.0 |
| Trạng thái | Working baseline |

## Ranh giới service

| Thành phần | Nhiệm vụ | Không làm |
|---|---|---|
| Spring Cloud Gateway | Entry point, route, JWT edge validation, CORS, rate/request limit, correlation ID | Không phát token, business logic/DB |
| Auth Service | Credential, account, role, refresh session, JWT/JWKS | Không sở hữu profile, Company, CV/Job/Application |
| Core Service | Profile, Company/member, CV metadata/version, Job/version, Application/history, consent/outbox | Không parse, embedding, matching/taxonomy |
| AI API | ParsedCV/JD, taxonomy, task, embedding, MatchingResult/evidence/version | Không sở hữu credential/workflow tuyển dụng |
| AI Worker | Parse/normalize/embed/match/reprocess qua RabbitMQ | Không public API nghiệp vụ |

Mỗi service dùng DB credential riêng, không cross-schema. Client chỉ gọi Gateway qua `/api/v1`. ID dùng UUID; thời gian ISO-8601 UTC; `X-Correlation-Id` đi xuyên HTTP/event; create API nhận `Idempotency-Key`. Async trả `202` với `taskId`, `resourceId`, `status`, `statusUrl`, `submittedAt`. Error trả `code`, `message`, `details`, `correlationId`, `timestamp`.

## Gateway routes

| Public path | Đích |
|---|---|
| `/api/v1/auth/**`, `/users/**` | Auth |
| `/api/v1/companies/**`, `/candidates/**`, `/cvs/**`, `/jobs/**`, `/applications/**` | Core |
| `/api/v1/parsed-*/**`, `/matching-*/**`, `/rankings/**`, `/taxonomy/**`, `/ai-tasks/**` | AI API |

Gateway validate token ở biên; downstream vẫn verify JWT và authorize ownership.

## Auth Service API

| Method + path | Làm gì | Response tối thiểu |
|---|---|---|
| `POST /auth/register` | Tạo account | `userId`, `email`, `roles`, `status`, `createdAt` |
| `POST /auth/login` | Xác thực | `accessToken`, `tokenType`, `expiresIn`, `refreshToken` |
| `POST /auth/refresh` | Rotate refresh | Token pair mới, token cũ revoke |
| `POST /auth/logout` | Revoke session | `204` |
| `GET /auth/me` | Identity hiện tại | `userId`, `email`, `roles`, `status` |
| `GET /.well-known/jwks.json` | Public key | JWKS có `kid`, `kty`, `alg`, `use` |
| `PATCH /users/{id}/status` | Admin khóa/mở | `userId`, `status`, `updatedAt`, audit ref |

JWT có `iss`, `aud`, `sub`, `roles`, `iat`, `exp`, `jti`; không chứa PII/Company membership đầy đủ.

## Core Service API

| Nhóm | Method + path | Làm gì | Response tối thiểu |
|---|---|---|---|
| Profile | `GET/PUT /candidates/me` | Đọc/cập nhật | Candidate DTO + `version` |
| Company | `POST /companies` | Tạo Company | `companyId`, profile, creator membership |
| Company | `POST /companies/{id}/members` | Thêm Recruiter | `userId`, `companyId`, `role`, `status` |
| CV | `POST /cvs` | Validate PDF, lưu MinIO, outbox | `202`: `cvId`, `cvVersionId`, `taskId`, `statusUrl` |
| CV | `GET /cvs`, `GET /cvs/{id}` | List/detail | Metadata/version/task; không public file URL |
| CV | `GET /cvs/{id}/versions/{vid}/download` | Tải private | Signed URL/token + `expiresAt` |
| CV | `POST /cvs/{id}/versions/{vid}/confirm` | Confirm parsed ref | IDs, revision, `CONFIRMED` |
| Job | `POST /jobs`, `PUT /jobs/{id}` | Tạo/chỉnh draft | IDs, `DRAFT`, optimistic `version` |
| Job | `POST /jobs/{id}/parse` | Parse JD | `202`: IDs, task/status URL |
| Job | `POST /jobs/{id}/publish`, `/close` | Đổi vòng đời | Status + timestamp |
| Job | `GET /jobs`, `GET /jobs/{id}` | Search/detail | Page/detail + version/freshness refs |
| Application | `POST /applications` | Ứng tuyển | IDs, `SUBMITTED`, time |
| Application | `GET /applications`, `GET /applications/{id}` | List/detail | Summary/history + matching ref/status |
| Application | PATCH /applications/{id}/status | Recruiter đổi sang UNDER_REVIEW/SHORTLISTED/REJECTED theo transition hợp lệ | Status/history/version hoặc 409 |
| Application | POST /applications/{id}/withdraw | Candidate rút đơn của chính mình, bắt buộc reason | WITHDRAWN terminal + history |

Core không copy AI blob. AI lỗi vẫn tạo Application; matching là PENDING/UNAVAILABLE. Unique Candidate–Job áp dụng toàn vòng đời; conflict/re-apply trả Application hiện có hoặc 409 theo contract, không tạo bản mới.

## AI API

| Nhóm | Method + path | Làm gì | Response tối thiểu |
|---|---|---|---|
| Parse | `GET/PUT /parsed-cvs/{id}` | Đọc/sửa ParsedCV | Schema/revision/status/fields/confidence/provenance/evidence/flags |
| Parse | `POST /parsed-cvs/{id}/confirm` | Freeze revision | `CONFIRMED`, revision, actor/time |
| Parse | `GET/PUT /parsed-jds/{id}` | Đọc/sửa ParsedJD | Requirements/evidence/revision/status |
| Parse | `POST /parsed-jds/{id}/confirm` | Freeze JD | `CONFIRMED`, revision/time |
| Task | `GET /ai-tasks/{id}` | Theo dõi | Type/state/attempt/progress/safe error/refs/time |
| Task | `POST /ai-tasks/{id}/retry` | Retry | `202`: task/attempt/idempotency ref |
| Match | `POST /matching-requests` | Core/internal yêu cầu match theo applicationId và snapshot refs | `200` current result hoặc `202` task |
| Match | `GET /matching-results/{id}` | Detail | Score/confidence/components/evidence/facts/flags/version tuple |
| Match | `GET /rankings/jobs/{id}/applications` | Applicant ranking | Ranked + pending/unavailable |
| Match | `POST /matching-results/recompute` | Recompute | `202`: task/target version/count |
| Taxonomy | `GET /taxonomy/skills` | Search | Page skill/stable ID/relations/version |
| Taxonomy | `GET /taxonomy/pending-skills` | Unknown terms | Redacted context/candidates/status |
| Taxonomy | `POST /taxonomy/pending-skills/{id}/decisions` | Duyệt | Decision/skill/audit/version refs |
| Taxonomy | `POST /taxonomy/versions/{id}/publish` | Publish | Version/checksum/time/impact ref |

Không có endpoint personalized recommendation trước apply. Matching request bắt buộc trỏ Application hợp lệ; Candidate chỉ đọc MatchingResult của Application thuộc chính mình, Recruiter chỉ đọc/rank Application của Job thuộc Company có quyền.

MatchingResult lưu mọi input/model/algorithm/explanation version và immutable.

## AI Worker output

| Event | Output |
|---|---|
| `cv.uploaded.v1` | ParsedCV revision + task terminal + pending terms + event |
| JD parse request | ParsedJD revision + task/pending terms |
| `matching.requested.v1` | Immutable result hoặc safe failure |
| `taxonomy.published.v1` | Stale impact/reprocess batch, không sửa result cũ |

Event chỉ chứa ID/version/object reference, không raw CV/PII/token. Duplicate event không tạo logical duplicate.

## Contract test tối thiểu

JWT sai/cross-tenant bị chặn; Idempotency-Key/duplicate event không tạo duplicate; AI down vẫn apply; error không lộ stack/secret/raw CV.
