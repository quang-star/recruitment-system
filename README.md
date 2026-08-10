# DATN — AI-Assisted IT Recruitment System

Hệ thống tuyển dụng IT hỗ trợ phân tích CV, matching ứng viên–công việc có giải thích và đánh giá dựa trên bằng chứng.

## Kiến trúc thực thi

- `web`: React/Vite, chỉ gọi public Gateway.
- `gateway-service`: routing, JWT edge validation, CORS và correlation ID.
- `auth-service`: account, credential, global role, JWT/JWKS và session family.
- `core-service`: recruitment workflow; vertical slice đầu tiên là Candidate Profile.
- `ai-service`: FastAPI/Alembic; vertical slice đầu tiên là durable processing task.
- `contracts`: HTTP/event schema dùng chung, không chứa domain hoặc persistence model.
- `compose.yaml`: PostgreSQL với ba database owner riêng, RabbitMQ, MinIO và các service.

Ranh giới và invariant kiểm tra được mô tả tại [ARCHITECTURE.md](ARCHITECTURE.md).

## Chạy local

Yêu cầu: Java 21, Python 3.12, Node.js 22 và Docker Desktop.

~~~powershell
Copy-Item .env.example .env
# Thay toàn bộ giá trị replace-me trong .env trước khi chạy.
docker compose up --build
~~~

Chỉ Gateway (`8080`) và Web (`5173`) là entry point của ứng dụng. PostgreSQL,
RabbitMQ và MinIO đang expose port cho development; production profile phải đóng các port nội bộ.

## Kiểm chứng

~~~powershell
powershell -File scripts/validate-architecture.ps1
.\auth-service\mvnw.cmd -f pom.xml -DskipTests package
.\auth-service\mvnw.cmd -f pom.xml -pl gateway-service,core-service test
cd ai-service
python -m pytest -q
cd ..\web
npm.cmd run build
~~~

Integration test Auth/Core dùng PostgreSQL Testcontainers nên Docker Desktop phải hoạt động.

## Trạng thái hiện tại

- Auth đã có register, verify-email, login, JWT, refresh rotation, logout và JWKS.
- Gateway, Core, AI và Web đã có baseline buildable để khóa convention và service boundary.
- Core/AI mới có vertical slice kiểm chứng kiến trúc; CV, Job, Application, parsing và matching chưa hoàn thiện.
- External email provider, outbox publisher/consumer và AI worker RabbitMQ chưa được triển khai.
- Raw dataset và artifact local không được version; tài liệu, contract, source và manifest phải được version.
