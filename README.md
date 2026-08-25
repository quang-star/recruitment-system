# DATN — AI-Assisted IT Recruitment System

Hệ thống tuyển dụng IT hỗ trợ phân tích CV, matching ứng viên–công việc có giải thích và đánh giá dựa trên bằng chứng.

## Kiến trúc thực thi

- `web`: React/Vite, chỉ gọi public Gateway.
- `gateway-service`: routing, JWT edge validation, CORS và correlation ID.
- `auth-service`: account, credential, global role, JWT/JWKS và session family.
- `core-service`: recruitment workflow, immutable Job/Application snapshots và các projection đọc nhanh.
- `ai-service`: FastAPI/Alembic; durable processing task, ParsedCV/ParsedJD revisions và worker Kafka cho CV/matching.
- `contracts`: HTTP/event schema dùng chung, không chứa domain hoặc persistence model.
- `compose.yaml`: PostgreSQL với ba database owner riêng, Kafka chạy KRaft, MinIO và các service.

Ranh giới và invariant kiểm tra được mô tả tại [ARCHITECTURE.md](ARCHITECTURE.md).

## Chạy local

Yêu cầu: Java 21, Python 3.12, Node.js 22 và Docker Desktop.

~~~powershell
Copy-Item .env.example .env
# Thay toàn bộ giá trị replace-me trong .env trước khi chạy.
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/generate-dev-jwt-keys.ps1
docker compose -f compose.yaml -f compose.dev.yaml up --build
~~~

Chỉ Gateway (`8080`) và Web (`5173`) là entry point của ứng dụng. Kafka và MinIO chỉ được
expose port qua `compose.dev.yaml`; file `compose.yaml` giữ PostgreSQL, Kafka và MinIO trong
Docker network nội bộ. Khóa JWT local nằm trong `.local/secrets`, không được commit.

## Kiểm chứng

~~~powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validate-architecture.ps1
.\auth-service\mvnw.cmd -f pom.xml -DskipTests package
.\auth-service\mvnw.cmd -f pom.xml test
cd ai-service
python -m pytest -q -p no:cacheprovider
cd ..\web
npm.cmd run build
~~~

Có thể chạy toàn bộ gate bằng một lệnh sau (dùng virtual environment Python hiện tại):

~~~powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify.ps1
~~~

Lần đầu thiếu dependency AI, cài từ lockfile rồi chạy lại:

~~~powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify.ps1 -InstallAiDependencies
~~~

Thêm `-RunComposeSmoke` nếu muốn build và khởi động toàn bộ Docker Compose sau các gate unit/integration.

Integration test Auth dùng PostgreSQL Testcontainers nên Docker Desktop phải hoạt động.
Lệnh Maven `-DskipTests package` là gate compile nhanh khi Docker chưa sẵn sàng;
không thay thế cho full test.

## Trạng thái hiện tại

- Auth đã có register, verify-email, login, JWT, refresh rotation, logout và JWKS.
- Gateway, Core, AI và Web đã có baseline buildable để khóa convention và service boundary.
- Candidate Profile đã có vertical slice qua Gateway: JWT-protected API, optimistic locking và màn hình login/profile tối thiểu.
- Recruiter Profile và Company đã có Core vertical slice: role `RECRUITER`, Company owner membership,
  multi-tenant read/update authorization và optimistic locking qua Gateway.
- Job/JD đã có Core vertical slice: company-scoped recruiter authorization, draft versioning,
  optimistic locking và lifecycle `DRAFT` → `PUBLISHED` → `CLOSED`; ParsedJD review/confirm cập nhật Core projection,
  và publish bị chặn nếu active version chưa `CONFIRMED`.
- Application baseline đã có: ứng viên chỉ apply bằng CV version `CONFIRMED` vào Job đang mở,
  yêu cầu consent `CV_SHARING`/policy version, lưu snapshot job/CV version + access grant, transactional outbox `application.submitted.v1`, recruiter xem danh sách và chuyển trạng thái có optimistic locking.
- CV upload hiện đi qua private MinIO → transactional outbox → Kafka `cv.uploaded.v1` → AI worker đọc/parse PDF text → Kafka `cv.processing.updated.v1`; Core cập nhật `processingStatus` có kiểm tra `sourceHash`.
- AI lưu ParsedCV revision có ownership theo candidate, hỗ trợ review qua `GET /api/v1/parsed-cvs/{cvVersionId}`, sửa immutable revision qua `PUT /api/v1/parsed-cvs/{cvVersionId}` với optimistic locking và confirm qua `POST /api/v1/parsed-cvs/{cvVersionId}/confirm`; event `cv.confirmed.v1` cập nhật Core sang `CONFIRMED`.
- AI có ParsedJD revision ownership theo recruiter, parser rule-based có canonical skill/evidence, review qua `GET/PUT /api/v1/parsed-jds/{jobVersionId}` và confirm qua `POST .../confirm`; event cập nhật projection Core.
- Matching baseline deterministic (`required/preferred skills`, experience, title, metadata, responsibility keywords) chạy qua Kafka sau application submit, lưu explanation/components/claims và Core expose `GET /api/v1/applications/{applicationId}/match`.
- Candidate workspace đã có structured ParsedCV editor cho kỹ năng, kinh nghiệm và tổng thời lượng kinh nghiệm. AI worker retry tối đa theo cấu hình với backoff rồi chuyển event sang DLQ có metadata replay; parser vẫn là baseline `pypdf` cho CV text, còn OCR và evaluation dataset ở backlog.
- Email vẫn dùng Mailpit local; external email provider và production secret manager chưa được triển khai.
- Auth dùng cặp RSA PEM bền vững được mount read-only; Gateway, Core và AI đều kiểm tra
  signature, issuer, expiry và audience.
- Web Docker build dùng `package-lock.json`/`npm ci`; AI runtime dùng `requirements.lock` làm
  constraint để build có thể lặp lại.
- Rotation key có giai đoạn chồng lấn và secret manager production chưa được triển khai.
- Raw dataset và artifact local không được version; tài liệu, contract, source và manifest phải được version.
