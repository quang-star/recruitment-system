# Triển khai Smart Recruitment trên Coolify

## 1. Chuẩn bị server và ứng dụng

- Chuẩn bị server Ubuntu chạy Docker/Coolify với đủ RAM, CPU và dung lượng cho 3
  service Java, PostgreSQL, Kafka, MinIO, AI/OCR và quá trình build image. Mức tối
  thiểu của bản thân Coolify không phải mức tài nguyên đủ cho toàn bộ stack này.
- Trỏ DNS của domain ứng dụng tới server chạy resource; cho proxy Coolify nhận HTTP
  `80` và HTTPS `443` để cấp chứng chỉ TLS. Chuẩn bị SMTP thật và địa chỉ gửi mail
  thuộc domain bạn quản lý nếu cần đăng ký/xác minh tài khoản qua email.
- Tạo **Application từ Git**, chọn nhánh muốn triển khai (ví dụ `main`), build
  strategy **Docker Compose**, base directory là root repo, Compose location là
  `compose.yaml`. Bật **Preserve repository during deployment** vì PostgreSQL bind
  mount thư mục `./infra/postgres/init` từ source Git để tạo ba database lần đầu.
- Gán một domain `https://app.example.com` cho service **`web`**, cổng **bên trong
  container `80`**. Nginx Web chuyển `/api/` tới Gateway trong cùng Compose network;
  không cần gán domain riêng cho Gateway. Cổng host `5173`/`8080` chỉ bind loopback.
  Không dùng `compose.dev.yaml` hoặc profile `test` trên server. `kafka-init` là tác
  vụ một lần, thoát thành công sau khi tạo topic.

## 2. Tạo khóa JWT bền vững trên server

Tạo hai file PEM **trên server chạy resource**, ngoài checkout Git, trước lần deploy
đầu. Ví dụ trên Ubuntu (chỉ thực hiện khi cả hai file chưa tồn tại):

```bash
key_dir=/srv/smart-recruitment/secrets
sudo install -d -m 700 -o root -g root "$key_dir"
if sudo test -e "$key_dir/auth-jwt-private.pem" || sudo test -e "$key_dir/auth-jwt-public.pem"; then
  echo 'JWT key already exists; keep the existing pair.' >&2
else
  sudo openssl genpkey -quiet -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out "$key_dir/auth-jwt-private.pem"
  sudo openssl pkey -in "$key_dir/auth-jwt-private.pem" -pubout -out "$key_dir/auth-jwt-public.pem"
  sudo chmod 600 "$key_dir/auth-jwt-private.pem"
  sudo chmod 644 "$key_dir/auth-jwt-public.pem"
fi
```

Đặt `AUTH_JWT_PRIVATE_KEY_FILE=/srv/smart-recruitment/secrets/auth-jwt-private.pem`
và `AUTH_JWT_PUBLIC_KEY_FILE=/srv/smart-recruitment/secrets/auth-jwt-public.pem` trong
Coolify. Compose mount hai file chỉ đọc vào Auth. Giữ cặp khóa khi redeploy; thay khóa
sẽ làm JWT hiện có không còn xác minh được. Sao lưu khóa riêng tư ở nơi an toàn,
không ghi nội dung khóa vào Git, Coolify log hoặc tài liệu.

## 3. Điền biến môi trường trong Coolify

Điền các biến sau trong **Environment Variables** của ứng dụng Compose trên Coolify,
không đưa giá trị thật vào Git hoặc file mẫu:

| Nhóm | Biến cần đặt |
| --- | --- |
| Database và object storage | `POSTGRES_ADMIN_PASSWORD`, `AUTH_DB_PASSWORD`, `CORE_DB_PASSWORD`, `AI_DB_PASSWORD`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`; chọn `POSTGRES_VOLUME_NAME` riêng nếu cùng server có stack khác. |
| URL công khai | `WEB_ORIGIN=https://app.example.com`, `AUTH_JWT_ISSUER` (một HTTPS issuer ổn định). Ba link xác minh email, đặt lại mật khẩu và lời mời công ty mặc định lấy từ `WEB_ORIGIN`; chỉ đặt `AUTH_EMAIL_VERIFICATION_BASE_URL`, `AUTH_EMAIL_PASSWORD_RESET_BASE_URL`, `CORE_EMAIL_COMPANY_INVITATION_BASE_URL` khi cần đường dẫn khác. |
| Email gửi đi | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `AUTH_EMAIL_FROM`, `CORE_EMAIL_FROM`; với SMTP cổng 587 thường đặt `SMTP_AUTH=true`, `SMTP_STARTTLS=true`, `SMTP_STARTTLS_REQUIRED=true`, `SMTP_SSL=false`. Với SMTP SSL cổng 465, dùng `SMTP_SSL=true` và `SMTP_STARTTLS=false` theo hướng dẫn nhà cung cấp. |
| Khóa JWT | `AUTH_JWT_PRIVATE_KEY_FILE`, `AUTH_JWT_PUBLIC_KEY_FILE`: đường dẫn tuyệt đối tới hai file PEM bền vững trên host Ubuntu. Tạo file trên server trước khi deploy, giữ khóa riêng tư ngoài repo và mount chỉ đọc. Không sinh lại khóa khi redeploy. |

Đánh dấu các mật khẩu/credential là **secret** trong Coolify. `SMTP_HOST` mặc định là
`mailpit` để chạy local; trên Coolify phải thay bằng SMTP thật nếu muốn người dùng
nhận email. Mailpit vẫn tồn tại nội bộ trong Compose nhưng không dùng cho gửi mail
khi `SMTP_HOST` đã đổi. `WEB_ORIGIN` phải dùng đúng domain HTTPS; không giữ giá trị
`localhost` của `.env.example`. Nếu các biến URL email đã có giá trị trong Coolify,
cập nhật chúng theo domain thật vì giá trị đã đặt sẽ ghi đè mặc định từ `WEB_ORIGIN`.
Không đặt dấu `/` cuối `WEB_ORIGIN`; các đường dẫn email mặc định được ghép sau URL
này. `AUTH_JWT_ISSUER` phải giống nhau ở Auth, Core, AI và Gateway (Compose truyền
cùng một biến). Vì `AI_DB_PASSWORD` được ghép trực tiếp vào URL kết nối PostgreSQL,
chọn mật khẩu ngẫu nhiên chỉ gồm các ký tự an toàn cho URL (chữ, số, `-`, `_`) để
không làm sai cú pháp URL. Khi tạo stack mới, dùng tên `POSTGRES_VOLUME_NAME` riêng;
đổi tên volume sau khi có dữ liệu không tự chuyển dữ liệu sang volume mới.
Web Compose dùng `/api/` cùng origin qua Nginx, nên không cần đặt `VITE_GATEWAY_URL`
cho build Web trên Coolify; biến này chỉ cần khi đóng gói client gọi Gateway ở một
origin HTTPS khác.

## 4. Deploy và kiểm tra trên domain thật

1. Kiểm tra lại branch/commit, domain, các biến HTTPS/SMTP, đường dẫn hai file PEM
   và mount `infra/postgres/init`, rồi chọn **Deploy**. Xem Deployment Logs và Runtime
   Logs; PostgreSQL phải tạo đủ `auth_db`, `core_db`, `ai_db`, `kafka-init` phải thoát
   thành công, Auth/Core/AI phải hoàn tất migration. Đừng coi việc Web mở được là bằng
   chứng các service còn lại đã sẵn sàng.
2. Mở domain HTTPS và kiểm tra trang chủ, tải API công khai qua `/api/`, đăng ký tài
   khoản thử → nhận email thật → xác minh → đăng nhập → quên mật khẩu. Kiểm tra link
   lời mời công ty nếu dùng luồng nhà tuyển dụng.
3. Dùng dữ liệu tổng hợp để thử tải CV PDF lớn hơn 1 MiB nhưng dưới giới hạn request
   10 MB, phân tích/xác nhận CV hoặc JD, và kiểm tra file được lưu/đọc lại. Nginx Web
   hiện cho `/api/` tối đa `10m`, khớp giới hạn request của Core; file sát 10 MB có
   thể vượt giới hạn do phần multipart đi kèm. Không gửi CV thật tới provider AI chỉ
   để thử deploy.
4. Chỉ mở cho người dùng sau khi đã có backup PostgreSQL cho cả ba database, backup
   MinIO và khóa JWT ở nơi khác server, và thử khôi phục trên môi trường cô lập.
   Coolify instance backup không bao gồm dữ liệu ứng dụng; volume bền vững cũng
   không thay thế backup. Theo dõi RAM/disk và log khi chạy OCR, Kafka và build.

Nếu deploy lên database đã có dữ liệu UUID cũ, làm quy trình nâng cấp ID ở phần
kiến trúc trước khi chạy migration bản mới; không khởi động trực tiếp lên dữ liệu
đó. Init script PostgreSQL chỉ chạy khi volume database mới/trống. Không đổi mật
khẩu hoặc tên volume rồi kỳ vọng init script chạy lại trên dữ liệu đang có.

Google login là tùy chọn: thêm origin HTTPS thật trong Google Cloud nếu dùng.
`AUTH_GOOGLE_CLIENT_ID` hiện chưa được truyền qua `compose.yaml`, nên chỉ thêm biến
đó trong Coolify **chưa** đổi Client ID của Auth container; cần cập nhật Compose
trước khi dùng một Client ID khác. Các provider AI bên ngoài vẫn tắt mặc định và
không cần API key để chạy parser/OCR local.

Tài liệu Coolify: [Docker Compose từ Git](https://coolify.io/docs/applications/builds/docker-compose),
[domain và HTTPS](https://coolify.io/docs/core/networking/domains),
[biến môi trường](https://coolify.io/docs/applications/configuration/environment-variables),
[persistent storage](https://coolify.io/docs/applications/configuration/persistent-storage).
