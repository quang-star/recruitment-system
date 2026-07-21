# Use Case Catalog & Specifications

| Thuộc tính | Giá trị |
|---|---|
| Mã tài liệu | DOC-UC-001 |
| Phiên bản | 0.2.0 |
| Trạng thái | Working baseline |

## 1. Use case catalog

### Candidate

| Mã | Tên | Mục tiêu | Ưu tiên | Rule chính |
|---|---|---|---|---|
| UC-CAN-01 | Đăng ký/đăng nhập | Truy cập hệ thống an toàn | Must | BR-001 |
| UC-CAN-02 | Quản lý hồ sơ | Cập nhật profile không dùng làm protected feature | Should | BR-037 |
| UC-CAN-03 | Upload và theo dõi CV | Tạo CVVersion và biết trạng thái xử lý | Must | BR-005 đến BR-008, BR-042 đến BR-045 |
| UC-CAN-04 | Xác nhận ParsedCV | Sửa/xác nhận dữ liệu dùng cho matching | Must | BR-007 đến BR-009 |
| UC-CAN-05 | Duyệt Job Published | Tìm/lọc Job không personalized trước apply | Must | BR-010 |
| UC-CAN-06 | Xem kết quả Application | Hiểu component, evidence và khoảng thiếu sau apply | Must | BR-025 đến BR-031 |
| UC-CAN-07 | Ứng tuyển | Tạo Application không phụ thuộc AI availability | Must | BR-032, BR-033 |
| UC-CAN-08 | Theo dõi/rút đơn | Theo dõi history và rút từ Submitted/UnderReview/Shortlisted | Must | BR-034, BR-035 |

### Recruiter

| Mã | Tên | Mục tiêu | Ưu tiên | Rule chính |
|---|---|---|---|---|
| UC-REC-01 | Quản lý Company cơ bản | Duy trì thông tin công ty và membership | Must | BR-001, BR-002 |
| UC-REC-02 | Tạo/chỉnh sửa JD | Tạo JobVersion và yêu cầu tuyển dụng | Must | BR-006 đến BR-010 |
| UC-REC-03 | Xác nhận ParsedJD | Chốt required/preferred và field khác | Must | BR-007 đến BR-010 |
| UC-REC-04 | Publish/close Job | Quản lý vòng đời Draft/Published/Closed | Must | BR-010 |
| UC-REC-05 | Xem applicant ranking | Sàng lọc theo JD có quality flag | Must | BR-019 đến BR-031, BR-036 |
| UC-REC-06 | Xem CV và giải thích | Kiểm chứng score bằng CV/evidence | Must | BR-003, BR-027, BR-040 |
| UC-REC-07 | Cập nhật Application | Ghi nhận quyết định của con người | Must | BR-034, BR-036, BR-046 |

### Admin

| Mã | Tên | Mục tiêu | Ưu tiên | Rule chính |
|---|---|---|---|---|
| UC-ADM-01 | Quản lý user/company | Khóa/mở và hỗ trợ có audit | Should | BR-001, BR-004, BR-046 |
| UC-ADM-02 | Quản lý taxonomy/alias | Duy trì canonical skill có version | Must | BR-011, BR-016, BR-018 |
| UC-ADM-03 | Duyệt PendingSkill | Approve/edit/merge/reject/defer proposal | Must | BR-012 đến BR-018, BR-038 |
| UC-ADM-04 | Theo dõi và retry task lỗi | Phục hồi task/DLQ an toàn | Must | BR-042 đến BR-046 |
| UC-ADM-05 | Xem audit/version | Điều tra và tái lập thay đổi | Should | BR-016, BR-030, BR-046 |

### AI Worker

| Mã | Tên | Mục tiêu | Ưu tiên | Rule chính |
|---|---|---|---|---|
| UC-AI-01 | Parse CV | Tạo ParsedCV có confidence/evidence | Must | BR-005 đến BR-009, BR-037 |
| UC-AI-02 | Parse JD | Tạo ParsedJD có confidence/evidence | Must | BR-007 đến BR-010 |
| UC-AI-03 | Normalize thuật ngữ | Map taxonomy hoặc tạo PendingSkill | Must | BR-011 đến BR-018 |
| UC-AI-04 | Tính hybrid matching | Tạo score/component/penalty có version | Must | BR-019 đến BR-026, BR-029 đến BR-031 |
| UC-AI-05 | Tạo explanation | Tạo claim bám evidence | Must | BR-027, BR-028 |
| UC-AI-06 | Reprocess theo version | Tạo result mới, giữ result cũ | Should | BR-018, BR-030, BR-042 đến BR-044 |

## 2. UC-CAN-03 — Upload và theo dõi CV

| Thuộc tính | Nội dung |
|---|---|
| Actor chính | Candidate |
| Actor phụ | Object Storage, Queue, AI Worker |
| Trigger | Candidate chọn Upload CV |
| Tiền điều kiện | Đã xác thực; consent hợp lệ |
| Hậu điều kiện thành công | CVVersion và ProcessingTask được tạo; trạng thái có thể theo dõi |
| Hậu điều kiện thất bại | Không tạo dữ liệu mồ côi; lỗi an toàn, có thể sửa |
| Ưu tiên | Must |
| Rule | BR-005 đến BR-008, BR-042 đến BR-045 |

### Luồng chính

1. Candidate chọn file PDF và xác nhận mục đích xử lý.
2. Hệ thống kiểm tra định dạng/signature/kích thước.
3. Hệ thống hash file, lưu object và tạo CVVersion.
4. Hệ thống tạo task/event có idempotency key.
5. UI nhận `cvVersionId`, `taskId`, trạng thái `Queued`.
6. Candidate theo dõi `Processing → Parsed/NeedsReview/Failed`.
7. Khi Parsed/NeedsReview, hệ thống dẫn Candidate sang UC-CAN-04.

### Luồng thay thế/ngoại lệ

- A1: Cùng file/cùng request key → trả task hiện có.
- A2: CV scan → NeedsReview và cho nhập thủ công.
- E1: File giả PDF/encrypted/oversize → từ chối trước khi enqueue.
- E2: Worker lỗi tạm thời → Retrying; UI hiển thị trạng thái, không tạo upload mới.
- E3: Worker lỗi vĩnh viễn → Failed với error code không lộ nội bộ.

### Acceptance criteria

- Double click/retry HTTP không tạo hai CVVersion ngoài ý muốn.
- Event không chứa raw CV/PII.
- Candidate khác không đọc được task/CV.
- Mọi trạng thái terminal có timestamp và hướng xử lý.

## 3. UC-CAN-04 — Xác nhận ParsedCV

| Thuộc tính | Nội dung |
|---|---|
| Actor chính | Candidate |
| Trigger | CV parse xong hoặc NeedsReview |
| Tiền điều kiện | Candidate sở hữu CVVersion |
| Hậu điều kiện | ParsedCV Confirmed; event reindex/recompute được tạo |
| Ưu tiên | Must |
| Rule | BR-007 đến BR-009, BR-018 |

### Luồng chính

1. Hệ thống hiển thị từng field, confidence và evidence span.
2. Candidate sửa value, map skill, thêm/bỏ experience/project nếu cần.
3. Hệ thống validate schema/date range/duplicate.
4. Candidate xác nhận.
5. Hệ thống lưu revision/audit, trạng thái Confirmed.
6. Hệ thống phát `cv.confirmed.v1` theo outbox.

### Ngoại lệ

- Field không có evidence nhưng Candidate xác nhận → provenance `user_asserted`.
- Date range invalid → không cho confirm và chỉ rõ lỗi.
- Taxonomy term chưa biết → giữ Pending, không chặn confirm toàn CV.

## 4. UC-CAN-05/06 — Duyệt Job và xem kết quả Application

| Thuộc tính | Nội dung |
|---|---|
| Actor chính | Candidate |
| Trigger | Candidate mở danh sách/chi tiết Job hoặc Application của chính mình |
| Tiền điều kiện | Job Published; để xem explanation phải có Application thuộc Candidate |
| Hậu điều kiện | Candidate duyệt Job hoặc kiểm tra result post-apply của chính mình |
| Ưu tiên | Must |
| Rule | BR-019 đến BR-031, BR-040 |

### Luồng chính

1. Hệ thống trả danh sách Job Published theo filter/pagination, không personalized score/ranking.
2. Candidate mở JD và có thể chuyển sang UC-CAN-07 để ứng tuyển.
3. Sau khi có Application, Candidate mở Application thuộc chính mình.
4. Khi MatchingResult sẵn sàng, hệ thống hiển thị component, matched/missing/uncertain criteria và evidence.
5. Hệ thống nêu rõ algorithm/taxonomy version ở audit detail.

### Ngoại lệ

- Chưa có Application → không tạo hoặc hiển thị personalized matching.
- Matching post-apply đang xử lý → hiển thị Pending, không dùng 0.
- Semantic service lỗi → hiển thị degraded rule-only nếu có.
- Không đủ dữ liệu → `INSUFFICIENT_DATA` và hướng bổ sung hồ sơ.
- Job ngoài nhóm evaluated → hiển thị limitation, không tuyên bố chất lượng tương đương.

## 5. UC-CAN-07 — Ứng tuyển

| Thuộc tính | Nội dung |
|---|---|
| Actor chính | Candidate |
| Trigger | Candidate chọn Apply |
| Tiền điều kiện | Job Published; CVVersion hợp lệ; Candidate chưa từng tạo Application cho Job |
| Hậu điều kiện | Application Submitted và snapshot version được lưu |
| Ưu tiên | Must |
| Rule | BR-032, BR-033, BR-042, BR-044 |

### Luồng chính

1. Candidate chọn CVVersion và xem consent chia sẻ.
2. Hệ thống kiểm tra Job còn Published trong transaction.
3. Hệ thống tạo Application với Candidate/Job/CV/JobVersion snapshot.
4. Nếu result chưa có, tạo task matching; không chặn apply.
5. Trả Application Submitted.

### Ngoại lệ

- Request lặp → trả application hiện có.
- Job vừa Close → không tạo application.
- AI unavailable → application vẫn thành công, score Pending.

## 6. UC-REC-02/03/04 — Tạo, xác nhận và publish JD

| Thuộc tính | Nội dung |
|---|---|
| Actor chính | Recruiter |
| Actor phụ | AI Worker, Admin khi có PendingSkill |
| Trigger | Recruiter tạo Job draft |
| Tiền điều kiện | Membership/Company active |
| Hậu điều kiện | Job Published với JobVersion/ParsedJD confirmed |
| Ưu tiên | Must |
| Rule | BR-002, BR-006 đến BR-018 |

### Luồng chính

1. Recruiter nhập title/raw JD và lưu Draft.
2. Hệ thống tạo JobVersion + parsing task.
3. Worker trả ParsedJD kèm confidence/evidence.
4. Recruiter phân loại required/preferred, sửa experience/level/language.
5. Hệ thống validate tối thiểu và lưu audit.
6. Recruiter Confirm và Publish.
7. Hệ thống phát `job.published.v1`.

### Ngoại lệ

- Parser lỗi → Recruiter có thể nhập cấu trúc thủ công.
- PendingSkill → không chặn toàn JD; không dùng pending term làm critical hard constraint.
- Sửa raw JD đã publish → version mới phải confirm trước khi active.

## 7. UC-REC-05/06 — Xem applicant ranking và evidence

| Thuộc tính | Nội dung |
|---|---|
| Actor chính | Recruiter |
| Trigger | Recruiter mở Applicants của Job |
| Tiền điều kiện | Recruiter có quyền trên Company/Job |
| Hậu điều kiện | Có danh sách đầy đủ, không ẩn vì AI lỗi/score thấp |
| Ưu tiên | Must |
| Rule | BR-002, BR-003, BR-019 đến BR-031, BR-036, BR-040 |

### Luồng chính

1. Kiểm tra quyền Company/Job.
2. Lấy applications phân trang và current MatchingResult nếu có.
3. Hiển thị score/status/quality flags; cho sort/filter không phá dữ liệu gốc.
4. Recruiter xem CV được chia sẻ và evidence theo component.
5. Recruiter chuyển sang UC-REC-07 để ghi quyết định.

### Ngoại lệ

- Result pending/failed → Candidate vẫn xuất hiện.
- Result stale → hiển thị version hiện có và trạng thái recompute.
- Không có quyền → forbidden + security audit.

## 8. UC-REC-07 — Cập nhật Application

| Thuộc tính | Nội dung |
|---|---|
| Actor chính | Recruiter |
| Trigger | Recruiter chọn trạng thái mới |
| Tiền điều kiện | Có quyền trên Job; transition hợp lệ |
| Hậu điều kiện | Application và history được cập nhật atomically |
| Ưu tiên | Must |
| Rule | BR-034, BR-036, BR-046 |

### Luồng chính

1. Recruiter chọn application và trạng thái đích.
2. Hệ thống chỉ chấp nhận UnderReview, Shortlisted hoặc Rejected theo state machine đã freeze và kiểm tra optimistic version.
3. Recruiter bắt buộc nhập reason khi Rejected.
4. Hệ thống cập nhật và append history/audit.

Score không được tự gọi use case này.

## 9. UC-ADM-03 — Duyệt PendingSkill

| Thuộc tính | Nội dung |
|---|---|
| Actor chính | Admin/Domain Reviewer |
| Trigger | Admin mở hàng chờ hoặc nhận cảnh báo |
| Tiền điều kiện | Quyền taxonomy reviewer |
| Hậu điều kiện | Proposal có quyết định; taxonomy version mới nếu approve/merge |
| Ưu tiên | Must |
| Rule | BR-011 đến BR-018, BR-038, BR-046 |

### Luồng chính

1. Hệ thống hiển thị raw term, occurrence, redacted evidence, candidate matches và LLM suggestion nếu có.
2. Admin tìm/so sánh canonical skill hiện tại.
3. Admin chọn Approve/EditAndApprove/Merge/Reject/Deferred và nhập reason.
4. Hệ thống validate duplicate/cycle/category.
5. Với approve/merge, tạo taxonomy version mới và outbox event.
6. Tạo impact/reprocess plan; không sửa result cũ.

### Ngoại lệ

- Hai Admin xử lý đồng thời → optimistic lock; người sau reload.
- LLM suggestion thiếu/sai → vẫn review bằng local evidence.
- Merge tạo cycle → từ chối.

## 10. UC-AI-01/02/03 — Parsing và normalization

| Thuộc tính | Nội dung |
|---|---|
| Actor chính | AI Worker |
| Trigger | `cv.uploaded` hoặc `job.version.created` |
| Tiền điều kiện | Event hợp lệ, object/input tồn tại |
| Hậu điều kiện | Parsed document + evidence + confidence hoặc failure state |
| Ưu tiên | Must |
| Rule | BR-005 đến BR-018, BR-037 đến BR-045 |

### Luồng chính

1. Validate event schema/idempotency.
2. Lấy input theo reference bảo vệ.
3. Extract text, language và redacted feature text.
4. Parse fields theo schema version.
5. Normalize known terms, tạo PendingSkill cho unknown.
6. Validate output, lưu result/version và ack event.

### Ngoại lệ

- Duplicate event → trả result hiện có.
- Output invalid/transient → retry.
- Permanent document error → Failed.
- Low confidence → NeedsReview.

## 11. UC-AI-04/05 — Matching và explanation

| Thuộc tính | Nội dung |
|---|---|
| Actor chính | AI Worker |
| Trigger | Confirm/publish/recompute/on-demand |
| Tiền điều kiện | Input/config/version hợp lệ |
| Hậu điều kiện | Immutable MatchingResult có breakdown/evidence/explanation |
| Ưu tiên | Must |
| Rule | BR-019 đến BR-031, BR-037, BR-038, BR-044 |

### Luồng chính

1. Resolve input/version và idempotency key.
2. Tính applicable components và evidence confidence.
3. Tính base score, penalty, final score và flags.
4. Lưu component/evidence links.
5. Tạo template explanation.
6. Nếu bật LLM, rewrite từ allow-listed facts; validate/fallback.
7. Lưu result và ack.

### Ngoại lệ

- Embedding thiếu → degraded rule-only.
- Input thiếu → insufficient data.
- LLM fail → template; score không đổi.

## 12. Quy tắc mở rộng use case

Khi thêm actor/chức năng:

1. Tạo UC mới, không nhét nhiều mục tiêu độc lập vào UC cũ.
2. Gắn ít nhất một BO và FR; gắn BR khi có decision logic.
3. Bổ sung permission và privacy analysis.
4. Bổ sung alternate/exception flow, đặc biệt khi AI/queue thất bại.
5. Cập nhật `12-traceability.md` và backlog.
