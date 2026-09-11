# DATN — AI-Assisted IT Recruitment System

**Tên đề tài hiện hành (tác giả xác nhận ngày 2026-09-07): Nghiên cứu, thiết kế và phát triển hệ thống tuyển dụng thông minh dựa trên kiến trúc Microservices và AI.**

Hệ thống tuyển dụng IT hỗ trợ phân tích CV, matching ứng viên–công việc có giải thích và đánh giá dựa trên bằng chứng.

Yêu cầu Web trong ảnh trường cung cấp gồm giao diện/tương tác, quy trình phát triển phần mềm đầy đủ, framework phù hợp và áp dụng thuật toán/AI. Ảnh không quy định phải làm đồng thời chatbot, gợi ý và cá nhân hóa, cũng không đưa số service, quy mô dataset hay ngưỡng accuracy bắt buộc. Phạm vi thử nghiệm của đồ án hiện tập trung tuyển dụng CNTT và sàng lọc ban đầu.

Bộ tài liệu local đã lưu tên/ảnh yêu cầu trong `docs/19-thesis-title-and-school-requirements.md`, bản đồ 37 hạng mục và phần Microservices trong `docs/20-completion-plan-2026-09-07.md`, cùng hướng dẫn sửa/kiểm chứng trong `docs/21-implementation-and-verification-guide.md`. `docs/` đang bị Git ignore, cần bàn giao/backup riêng theo chính sách hiện hành. Tài liệu kế hoạch không phải xác nhận ứng dụng đã hoàn thành: matching hiện là rule/keyword baseline; semantic/hybrid và kết quả thực nghiệm đầy đủ vẫn cần triển khai/kiểm chứng.

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

Yêu cầu: Java 21, Python 3.12, Node.js 22 và Docker Engine/Compose v2 (hoặc Docker Desktop).

Ubuntu/Linux:

~~~bash
cp .env.example .env
# Thay toàn bộ giá trị replace-me trong .env trước khi chạy.
./scripts/generate-dev-jwt-keys.sh
docker compose -f compose.yaml -f compose.dev.yaml up -d --build
~~~

Windows/PowerShell:

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

Ubuntu/Linux (kích hoạt virtual environment Python 3.12 của AI trước khi chạy):

~~~bash
./scripts/validate-architecture.sh
./scripts/verify.sh
# Thêm build/start Compose và smoke test:
./scripts/verify.sh --compose-smoke
~~~

Windows/PowerShell:

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

Trên Linux, tùy chọn tương đương là `./scripts/verify.sh --install-ai-dependencies`.

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
  optimistic locking và lifecycle `DRAFT` → `PUBLISHED` → `CLOSED`; Core lưu private JD snapshot + outbox,
  AI worker parse bất đồng bộ; ParsedJD review/confirm cập nhật Core projection,
  và publish bị chặn nếu active version chưa `CONFIRMED`.
- Application baseline đã có: ứng viên chỉ apply bằng CV version `CONFIRMED` vào Job đang mở,
  yêu cầu consent `CV_SHARING`/policy version, idempotency key, cover letter, lưu snapshot job/CV version + access grant,
  transactional outbox `application.submitted.v1`; recruiter tải snapshot CV qua Gateway, xem breakdown/timeline và
  chuyển trạng thái có optimistic locking, candidate có thể rút hồ sơ ở trạng thái hợp lệ.
- CV upload hiện đi qua private MinIO → transactional outbox → Kafka `cv.uploaded.v1` → AI worker trích text bằng `pypdf`, tự fallback sang OCR Tesseract/Poppler khi text quá ít → Kafka `cv.processing.updated.v1`; Core cập nhật `processingStatus` có kiểm tra `sourceHash`.
- AI lưu ParsedCV revision có ownership theo candidate, hỗ trợ review qua `GET /api/v1/parsed-cvs/{cvVersionId}`, sửa immutable revision qua `PUT /api/v1/parsed-cvs/{cvVersionId}` với optimistic locking và confirm qua `POST /api/v1/parsed-cvs/{cvVersionId}/confirm`; event `cv.confirmed.v1` cập nhật Core sang `CONFIRMED`.
- AI có ParsedJD revision ownership theo recruiter, parser rule-based có canonical skill/evidence; Core gửi private snapshot cho worker, còn recruiter review qua `GET/PATCH /api/v1/parsed-jds/{jobVersionId}` và confirm qua `POST .../confirm`; event cập nhật projection Core.
- Matching baseline deterministic (`required/preferred skills`, experience, title, metadata, responsibility keywords) chạy qua Kafka sau application submit, lưu explanation/components/claims và Core expose `GET /api/v1/applications/{applicationId}/match`.
- Taxonomy IT v1 được seed vào AI DB, dùng chung cho parser/editor và được ghi version cùng matching result.
- Web xác minh lại user/role qua `/api/v1/auth/me`; company membership quyết định action quản trị, tuyển dụng hay chỉ xem.
- GitHub Actions chạy độc lập các gate contracts/AI, Java, Web và Compose config; Web có Vitest/Testing Library baseline.
- Candidate workspace đã có structured ParsedCV editor cho kỹ năng, kinh nghiệm và tổng thời lượng kinh nghiệm. AI worker retry tối đa theo cấu hình với backoff rồi chuyển event sang DLQ có metadata replay. OCR Việt/Anh chạy sau feature flag, có giới hạn trang/timeout/kích thước raster, hạ confidence và luôn gắn cờ review; bộ dữ liệu OCR gán nhãn để đo độ chính xác vẫn là hạng mục evaluation riêng.
- Email vẫn dùng Mailpit local; external email provider và production secret manager chưa được triển khai.
- Auth dùng cặp RSA PEM bền vững được mount read-only; Gateway, Core và AI đều kiểm tra
  signature, issuer, expiry và audience.
- Web Docker build dùng `package-lock.json`/`npm ci`; AI runtime dùng `requirements.lock` làm
  constraint để build có thể lặp lại.
- Rotation key có giai đoạn chồng lấn và secret manager production chưa được triển khai.
- Raw dataset và artifact local không được version; tài liệu, contract, source và manifest phải được version.

## Smoke test

Sau khi stack đã healthy, kiểm tra Gateway, JWKS và Web:

~~~bash
./scripts/smoke-test.sh
~~~

~~~powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/smoke-test.ps1
~~~

Để kiểm tra thêm login và danh sách Job, đặt `SMOKE_CANDIDATE_EMAIL` / `SMOKE_CANDIDATE_PASSWORD`
bằng một tài khoản candidate đã xác minh. `scripts/verify.ps1 -RunComposeSmoke` tự gọi smoke test sau khi start Compose.

## Dữ liệu demo và E2E

Seed qua public Gateway API; script tự đăng ký/xác minh email qua Mailpit, tạo profile/company/Job/CV/application,
chờ ParsedJD/ParsedCV/matching, kiểm tra timeline và tải immutable CV snapshot. Chạy lại không tạo dữ liệu trùng:

~~~bash
python3 scripts/seed-demo.py
~~~

Mặc định local dùng `recruiter.demo@smart.local` / `DemoRecruiter!2026` và
`candidate.demo@smart.local` / `DemoCandidate!2026`. Có thể thay bằng các biến
`DEMO_RECRUITER_EMAIL`, `DEMO_RECRUITER_PASSWORD`, `DEMO_CANDIDATE_EMAIL`,
`DEMO_CANDIDATE_PASSWORD`. Không dùng credential demo này ở môi trường public.

Sau khi seed, chạy bộ Chromium E2E cô lập trong Docker (candidate workspace, recruiter/company/JD/pipeline
và account recovery public):

~~~bash
docker compose -f compose.yaml -f compose.dev.yaml --profile test run --rm e2e
~~~

Playwright dùng host network để truy cập đúng hai public entry point `localhost:5173` và `localhost:8080`;
không cần mở thêm port nội bộ hoặc nới CORS. Ảnh chụp, video và trace chỉ được giữ trong
`web/test-results` khi test lỗi và không được version.

## OCR CV scan

AI image cài sẵn Poppler và Tesseract với gói ngôn ngữ `vie+eng`. Parser ưu tiên text layer; chỉ khi tín hiệu
text dưới ngưỡng mới rasterize tối đa `AI_OCR_MAX_PAGES` trang và OCR trong
`AI_OCR_TIMEOUT_SECONDS`. Có thể tắt fallback bằng `AI_OCR_ENABLED=false`. Output ghi rõ
`document.textExtractionMethod=OCR`, dùng confidence thấp hơn và có `OCR_REVIEW_REQUIRED`; raw OCR text và
ảnh trang tạm không được lưu vào payload/log.

Sau khi AI service đã chạy, kiểm tra toàn bộ đường OCR bằng một PDF chỉ chứa ảnh tổng hợp, không chứa dữ liệu
cá nhân:

~~~bash
./scripts/ocr-runtime-smoke.sh
~~~

Smoke test xác nhận PDF không có embedded text, OCR lấy được kỹ năng taxonomy, payload qua JSON Schema và
parser công bố đúng method/version/quality flags. Đây là bằng chứng tích hợp chức năng, không phải số đo độ
chính xác OCR; chỉ được claim accuracy sau khi đánh giá trên tập scan Việt/Anh gán nhãn riêng.

Đã rehearsal `docker compose down` rồi `up -d` mà không dùng `-v`: PostgreSQL giữ nguyên account/profile/company,
3 Job và 3 application; Kafka giữ topic; MinIO vẫn trả đúng PDF snapshot. Xóa volume chỉ khi chủ động muốn reset dữ liệu.

## Backup và khôi phục local

Backup gồm custom dump của `auth_db`, `core_db`, `ai_db`, toàn bộ object trong bucket CV/JD MinIO,
row count kiểm chứng, manifest và SHA-256 cho từng artifact. Mặc định script chụp online; thêm `--quiesce`
trước buổi bảo vệ để tạm dừng các service ghi dữ liệu trong lúc backup rồi tự khởi động lại:

~~~bash
./scripts/backup-local.sh --quiesce
# Kết quả nằm tại .local/backups/<UTC_TIMESTAMP>
~~~

Luôn diễn tập restore vào hai container PostgreSQL/MinIO tạm trước. Lệnh này không mount, xóa hay ghi vào
volume Compose đang chạy:

~~~bash
./scripts/restore-rehearsal.sh .local/backups/<UTC_TIMESTAMP>
~~~

Chỉ khi thực sự cần thay dữ liệu local hiện tại mới dùng lệnh phá huỷ có cờ xác nhận rõ ràng. Script dừng
Auth/Core/AI/Gateway/Web, kiểm tra checksum, thay ba database và bucket, so row count rồi mới khởi động lại:

~~~bash
./scripts/restore-local.sh .local/backups/<UTC_TIMESTAMP> --confirm-replace-current-data
./scripts/smoke-test.sh
~~~

Kafka ở đây là transport có thể tái tạo, không phải nguồn dữ liệu chuẩn; DB lưu outbox/task/idempotency và
MinIO lưu private snapshot. Backup không chứa `.env` hay private JWT key. Hãy lưu `.local/secrets` riêng trong
kho mã hoá có kiểm soát truy cập; mất key chỉ làm vô hiệu token đã ký trước đó, không làm mất account/database.

## Evaluation matching

File [evaluation/matching-annotation-template.csv](evaluation/matching-annotation-template.csv) là biểu mẫu ẩn danh
cho hai người chấm độc lập thang relevance `0–4`. Không điền `predicted_score` hoặc cho annotator xem điểm hệ thống
trước khi hoàn tất nhãn và adjudication. Sau khi ghép điểm của thuật toán vào bản CSV làm việc, chạy:

~~~powershell
cd ai-service
python -m app.evaluation.cli --input ..\evaluation\matching-annotations.csv --output ..\evaluation\matching-metrics.json --k 5
~~~

Công cụ kiểm tra range/duplicate và xuất MAE trên thang `0–4`, Spearman, nDCG@K, MRR, Recall@K,
Top-K agreement, raw agreement và quadratic weighted Cohen's kappa. Kết quả sẽ cảnh báo nếu chưa đủ 30 cặp,
thiếu nhãn người chấm thứ hai hoặc chỉ có một Job. Template không chứa nhãn mẫu để tránh biến dữ liệu giả thành
ground truth; dataset thật vẫn phải được ẩn danh, chấm độc lập và ghi limitation trong báo cáo.

## Lỗi môi trường thường gặp

- Docker Engine/daemon (hoặc Docker Desktop) chưa chạy hay lệnh `docker` không có trong `PATH`: Java integration
  test dùng Testcontainers và compose smoke sẽ không chạy; compile/unit test không thay thế cho gate tích hợp này.
- Linux báo `permission denied` với `/var/run/docker.sock`: thêm user vào group `docker`, sau đó đăng xuất/đăng nhập
  lại (hoặc mở shell mới). Khi `docker ps` chạy được không cần `sudo`, các script trong repo cũng không yêu cầu quyền
  quản trị theo từng lệnh Docker.
- Maven báo sai Java version: kiểm tra `java -version` là Java 21 trước khi chạy Maven wrapper.
- AI import/dependency lỗi: tạo `ai-service/.venv` bằng Python 3.12 rồi cài
  `python -m pip install -c requirements.lock -e ".[test]"` từ thư mục `ai-service`.
- Vite/Rollup báo thiếu optional native package sau khi chép `node_modules` giữa Windows/WSL/Linux: xóa thư mục
  dependency được sinh ở máy khác và chạy lại `npm ci` ngay trong môi trường hiện tại; không commit `node_modules`.
- Auth không start vì thiếu RSA PEM: chạy `scripts/generate-dev-jwt-keys.ps1`; khóa sinh ra nằm trong `.local/secrets`
  và bị Git/Docker build context bỏ qua.
- ParsedJD chưa xuất hiện ngay sau khi lưu: đây là luồng Kafka bất đồng bộ; UI tự poll trong thời gian ngắn. Kiểm tra
  topic `job.version.submitted.v1`, AI worker và DLQ nếu trạng thái không tiến triển.
