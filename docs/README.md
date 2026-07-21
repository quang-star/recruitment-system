# Bộ tài liệu chuẩn — Explainable IT Recruitment System

| Thuộc tính | Giá trị |
|---|---|
| Phiên bản baseline | 0.2.0 |
| Ngày cập nhật | 2026-07-20 |
| Trạng thái | Working baseline |
| Phạm vi | Hệ thống hỗ trợ tuyển dụng CNTT, đối sánh CV–JD đa tiêu chí có giải thích |
| Nguồn yêu cầu | Baseline đã chuẩn hóa từ tài liệu lịch sử local, prompt BA đã chốt và các quyết định trong thư mục này |

## 1. Mục đích

Đây là nguồn tài liệu chuẩn dùng xuyên suốt đồ án: từ chốt đề tài, phân tích nghiệp vụ, thiết kế, phát triển, kiểm thử, thực nghiệm đến viết báo cáo và bảo vệ. Bộ tài liệu được tổ chức theo hướng docs-as-code để có thể kiểm soát phiên bản, truy vết thay đổi và mở rộng mà không làm mất tính nhất quán.

Ba nguyên tắc xuyên suốt:

1. Sản phẩm có thể tiếp nhận các vị trí trong toàn lĩnh vực CNTT, nhưng chỉ tuyên bố độ tin cậy thực nghiệm trên các nhóm vị trí đã được đánh giá.
2. Điểm matching do phương pháp hybrid có tiêu chí và phiên bản rõ ràng tính toán; LLM không tự quyết định điểm và không tự loại ứng viên.
3. Mọi kết quả quan trọng phải truy vết được từ mục tiêu → yêu cầu → quy tắc → use case → dữ liệu → kiểm thử/thí nghiệm.

## 2. Thứ tự đọc và sử dụng

| Thứ tự | Tài liệu | Mục đích chính |
|---:|---|---|
| 0 | [Quản trị tài liệu](00-governance.md) | Quy ước mã, trạng thái, thay đổi và chất lượng |
| 1 | [Vision & Scope](01-vision-and-scope.md) | Chốt bài toán, mục tiêu, phạm vi và tiêu chí hoàn thành |
| 2 | [Stakeholder & Context](02-stakeholders-and-context.md) | Actor, quyền hạn, ranh giới hệ thống |
| 3 | [Business Processes](03-business-processes.md) | Luồng end-to-end, ngoại lệ và trạng thái |
| 4 | [Business Rules](04-business-rules.md) | Quy tắc nghiệp vụ có thể kiểm thử |
| 5 | [Use Cases](05-use-cases.md) | Tương tác giữa actor và hệ thống |
| 6 | [SRS](06-srs.md) | Functional và non-functional requirements |
| 7 | [Data Design](07-data-design.md) | Mô hình dữ liệu, versioning và hợp đồng dữ liệu |
| 8 | [AI & Matching Design](08-ai-matching-design.md) | Parsing, normalization, hybrid score, evidence, LLM guardrail |
| 9 | [System Architecture](09-system-architecture.md) | Ranh giới service, giao tiếp, scale và vận hành |
| 10 | [Evaluation Plan](10-evaluation-plan.md) | Dataset, annotation, baseline, metric và thí nghiệm |
| 11 | [Product Backlog](11-product-backlog.md) | Epic, user story, thứ tự triển khai và cut-line MVP |
| 12 | [Traceability Matrix](12-traceability.md) | Kiểm tra độ phủ và tác động thay đổi |
| 13 | [Risk, Decision & Open Questions](13-risks-decisions.md) | Rủi ro, quyết định, câu hỏi cần chốt và câu hỏi bảo vệ |
| 16 | [Service Responsibilities & API Contracts](16-api-service-contracts.md) | Trách nhiệm từng service, endpoint và response contract |
| 17 | [Development Phases & Delivery Plan](17-development-phases.md) | Trình tự phát triển theo phase, đầu ra và quality gate |
| 99 | [Glossary](99-glossary.md) | Thuật ngữ dùng thống nhất |

Các mẫu tái sử dụng nằm trong [`templates/`](templates/).

## 3. Phân cấp nguồn sự thật

Khi có mâu thuẫn, áp dụng thứ tự ưu tiên:

1. Quyết định đã được ghi nhận trong `13-risks-decisions.md`.
2. Phạm vi trong `01-vision-and-scope.md`.
3. Business rules và SRS hiện hành.
4. Thiết kế dữ liệu, AI và kiến trúc.
5. Backlog và kế hoạch triển khai.
6. Tài liệu cũ trong `local-reference/` chỉ là đầu vào lịch sử lưu local, không phải baseline hiện hành.

Không âm thầm sửa một tài liệu để thay đổi phạm vi. Thay đổi có ảnh hưởng phải tạo Decision Record/Change Request, phân tích tác động rồi cập nhật các liên kết truy vết.

## 4. Trạng thái nội dung

- **[ĐÃ CHỐT]**: quyết định nền tảng đã thống nhất; thay đổi cần Decision Record.
- **[ĐỀ XUẤT]**: phương án mặc định để tiếp tục làm; cần xác nhận trước khi freeze baseline.
- **[CẦN XÁC NHẬN]**: thiếu quyết định có thể ảnh hưởng phạm vi, dữ liệu hoặc kiến trúc.
- **[LOẠI KHỎI MVP]**: không thực hiện trong phiên bản bảo vệ, chỉ lưu để tránh scope creep.

Chi tiết quy ước nằm trong [00-governance.md](00-governance.md).

## 5. Baseline phạm vi hiện tại

| Nhóm | Baseline |
|---|---|
| Sản phẩm | Hệ thống hỗ trợ tuyển dụng cho lĩnh vực CNTT |
| Nghiên cứu | Parsing, normalization, hybrid CV–JD matching và evidence-based explanation |
| Thực nghiệm chính | Backend, Frontend, Full-stack, DevOps, Data/AI (cần xác nhận theo dữ liệu thực tế) |
| Ngôn ngữ | Việt, Anh và tài liệu song ngữ |
| Tài liệu đầu vào MVP | CV PDF có text ≤10 MB; JD nhập text/form; Việt/Anh/mixed; không OCR |
| Quyết định tuyển dụng | Con người quyết định; hệ thống không auto-reject |
| LLM | Should/tùy chọn; output không authoritative; chỉ đề xuất/diễn đạt, không tạo evidence hoặc quyết định điểm |
| Workflow | Chỉ applicant đã chủ động ứng tuyển; không sourcing; Application dừng ở Shortlisted/Rejected/Withdrawn |
| Triển khai | Local bằng Docker Compose trên máy 16 GB RAM; public VPS sau khi hoàn thiện; Web/Gateway là hai entry point public |

## 6. Cách cập nhật khi scale

Khi thêm vị trí CNTT, tiêu chí matching, loại tài liệu hoặc service mới:

1. Tạo Change Request và nêu lý do/giá trị.
2. Xác định claim mới có cần dữ liệu đánh giá mới không.
3. Cập nhật taxonomy/schema theo version, không sửa phá vỡ dữ liệu cũ.
4. Cập nhật BR/FR/NFR/UC liên quan.
5. Cập nhật ma trận truy vết và test/experiment.
6. Ghi migration/reprocessing plan.
7. Chỉ đổi trạng thái từ thử nghiệm sang được hỗ trợ khi đạt quality gate.

## 7. Definition of Ready cho phát triển

Một story chỉ sẵn sàng triển khai khi có:

- Actor và giá trị sử dụng rõ.
- Use case hoặc luồng nghiệp vụ liên quan.
- Business rule và acceptance criteria.
- Dữ liệu đầu vào/đầu ra đã xác định.
- Rủi ro quyền riêng tư đã xử lý.
- Dependency và cách kiểm thử.

## 8. Definition of Done mức hệ thống

Đồ án chỉ được coi là hoàn tất khi đồng thời có:

- Luồng CV → parse → confirm → apply → match → explain hoạt động end-to-end.
- Luồng JD → parse → confirm → publish → rank applicant hoạt động end-to-end.
- Taxonomy mở có PendingSkill và Admin approve/edit/merge/reject.
- Phương pháp chạy được khi không có API LLM.
- Kết quả lưu algorithm version, taxonomy version, input version và evidence.
- Có baseline, dữ liệu gán nhãn, metric và báo cáo kết quả thực nghiệm.
- Có kiểm thử quyền truy cập, retry/idempotency và dữ liệu nhạy cảm.
- Các claim trong báo cáo không vượt quá phạm vi đã đánh giá.



