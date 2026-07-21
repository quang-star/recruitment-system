# Quản trị tài liệu và truy vết

| Thuộc tính | Giá trị |
|---|---|
| Mã tài liệu | DOC-GOV-001 |
| Phiên bản | 0.1.0 |
| Trạng thái | [ĐỀ XUẤT] |
| Owner | Tác giả đồ án |

## 1. Mục tiêu

Thiết lập cách quản lý tài liệu để các quyết định nghiệp vụ, yêu cầu, thiết kế và thí nghiệm không tách rời nhau khi đồ án phát triển hoặc mở rộng quy mô.

## 2. Quy ước mã

| Tiền tố | Đối tượng | Ví dụ |
|---|---|---|
| BO | Business Objective | BO-01 |
| RO | Research Objective | RO-01 |
| RQ | Research Question | RQ-01 |
| ACT | Actor/Stakeholder | ACT-CAN |
| BP | Business Process | BP-03 |
| BR | Business Rule | BR-014 |
| UC | Use Case | UC-CAN-03 |
| FR | Functional Requirement | FR-021 |
| NFR | Non-functional Requirement | NFR-008 |
| ENT | Entity/Data Object | ENT-CV |
| API | API Contract | API-CV-01 |
| EVT | Domain Event | EVT-CV-01 |
| EXP | Experiment | EXP-MAT-03 |
| TC | Test Case | TC-MAT-012 |
| US | User Story | US-AI-07 |
| RSK | Risk | RSK-05 |
| DEC | Decision | DEC-004 |
| CR | Change Request | CR-2026-001 |

Mã đã dùng không được tái sử dụng cho nội dung khác. Nội dung bị loại giữ nguyên mã và chuyển trạng thái Deprecated/Rejected để bảo toàn lịch sử.

## 3. Trạng thái và mức độ chắc chắn

| Trạng thái | Ý nghĩa | Hành động được phép |
|---|---|---|
| [ĐÃ CHỐT] | Baseline đã thống nhất | Chỉ đổi qua DEC/CR có phân tích tác động |
| [ĐỀ XUẤT] | Phương án làm việc mặc định | Có thể tinh chỉnh trước khi freeze |
| [CẦN XÁC NHẬN] | Thiếu dữ liệu/quyết định quan trọng | Không dùng để đưa claim chắc chắn |
| [LOẠI KHỎI MVP] | Không nằm trong cut-line bảo vệ | Không đưa vào sprint MVP |
| Deprecated | Từng có hiệu lực nhưng đã thay thế | Giữ liên kết đến quyết định thay thế |

## 4. Mức ưu tiên

- **Must**: thiếu thì không chứng minh được mục tiêu chính hoặc không chạy được demo cốt lõi.
- **Should**: tăng đáng kể giá trị/độ tin cậy nhưng có thể lùi sau cut-line.
- **Could**: chỉ làm khi Must và thí nghiệm chính đã hoàn thành.
- **Won't now**: ghi nhận nhưng không lên kế hoạch cho đồ án.

## 5. Versioning

Áp dụng `MAJOR.MINOR.PATCH`:

- **MAJOR**: thay đổi schema/contract/phương pháp không tương thích hoặc thay đổi claim nghiên cứu.
- **MINOR**: thêm trường, rule, thành phần điểm hoặc chức năng tương thích ngược.
- **PATCH**: sửa mô tả, lỗi trình bày hoặc bug không đổi ý nghĩa.

Các đối tượng bắt buộc có version độc lập:

- Document baseline.
- ParsedCV/ParsedJD schema.
- Skill taxonomy.
- Matching algorithm và weight set.
- Embedding model/configuration.
- Dataset và annotation guideline.
- API/event contract.

## 6. Quy trình thay đổi

1. Tạo CR theo mẫu `templates/change-request.md`.
2. Xác định lý do, phạm vi và giá trị.
3. Phân tích tác động đến BO/RO/RQ, BP, BR, UC, FR/NFR, entity, test và experiment.
4. Chọn cách tương thích ngược, migration và reprocessing.
5. Ghi quyết định trong `13-risks-decisions.md` hoặc ADR riêng.
6. Cập nhật tài liệu nguồn và `12-traceability.md` trong cùng thay đổi.
7. Chạy kiểm tra liên kết/mã và review trước khi đổi baseline.

## 7. Quy tắc nguồn sự thật

- Business rule không được chỉ tồn tại trong code.
- Trọng số matching không được chỉ tồn tại trong slide hoặc notebook.
- Metric và số liệu thực nghiệm phải trỏ đến dataset version, code/config version và môi trường chạy.
- Explanation không phải nguồn điểm; nó là phép chiếu từ MatchingResult và Evidence.
- File Word cũ là historical input. Nếu nội dung chưa được đưa vào baseline này thì không mặc nhiên có hiệu lực.

## 8. Quality gate tài liệu

Trước mỗi milestone, kiểm tra:

- Không có hai mã trùng nhau.
- Mọi Must FR có UC, BR (nếu cần) và acceptance criteria.
- Mọi RQ có ít nhất một EXP/metric trả lời.
- Mọi entity nhạy cảm có owner, quyền truy cập và retention.
- Mọi event bất đồng bộ có idempotency key, retry và failure path.
- Mọi kết quả matching có input version, taxonomy version, algorithm version và evidence.
- Mọi claim “hỗ trợ” hoặc “tốt hơn” có phạm vi và bằng chứng đánh giá.
- Câu hỏi [CẦN XÁC NHẬN] có owner và hạn chốt.

## 9. Quy tắc review

| Loại thay đổi | Người review tối thiểu | Bằng chứng |
|---|---|---|
| Scope/claim nghiên cứu | Sinh viên + GVHD | DEC và cập nhật RQ/Evaluation |
| Business rule tuyển dụng | Sinh viên + reviewer có kiến thức tuyển dụng/CNTT | Scenario và acceptance test |
| Taxonomy/alias | Admin/domain reviewer | Evidence, nguồn và audit log |
| Weight/penalty | Sinh viên + kết quả experiment | Config version và report |
| Schema/API/event | Chủ service liên quan | Contract test/migration plan |
| Privacy/LLM external | Sinh viên + GVHD nếu dùng dữ liệu thật | Data flow và redaction test |

## 10. Freeze points đề xuất

| Mốc | Nội dung phải freeze |
|---|---|
| M1 — Scope freeze | Tên đề tài, RQ, in/out scope, nhóm thực nghiệm |
| M2 — Contract freeze | ParsedCV, ParsedJD, taxonomy và evidence schema v1 |
| M3 — Method freeze | Baseline, công thức hybrid, weight/penalty candidate sets |
| M4 — Data freeze | Dataset, guideline, split và metric |
| M5 — Feature freeze | Must backlog, API/event contracts |
| M6 — Result freeze | Experiment outputs, limitations và claim cuối cùng |

