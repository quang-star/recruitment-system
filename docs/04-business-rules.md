# Business Rules Catalog

| Thuộc tính | Giá trị |
|---|---|
| Mã tài liệu | DOC-BR-001 |
| Phiên bản | 0.2.0 |
| Trạng thái | Working baseline |

## 1. Cách đọc

- Mỗi rule mô tả điều kiện → hành động → kết quả có thể kiểm thử.
- “Score” luôn là hỗ trợ quyết định, không phải quyết định tuyển dụng.
- Các ngưỡng số học là [ĐỀ XUẤT] cho đến khi pilot/DEC freeze.

## 2. Identity, company và quyền truy cập

| Mã | Trạng thái | Điều kiện | Hành động/Kết quả | Kiểm thử chính |
|---|---|---|---|---|
| BR-001 | [ĐÃ CHỐT] | User gọi chức năng bảo vệ | Hệ thống xác thực và kiểm tra role/ownership trước khi xử lý | Candidate không gọi endpoint Recruiter/Admin |
| BR-002 | [ĐÃ CHỐT] | Recruiter thao tác Company/Job/Application | Chỉ cho phép khi membership active và tài nguyên thuộc Company đó | Recruiter công ty A không xem/sửa Job công ty B |
| BR-003 | [ĐÃ CHỐT] | Recruiter yêu cầu xem CV | Chỉ xem bản Candidate đã chia sẻ qua Application/consent hợp lệ | Không có Application/consent → forbidden |
| BR-004 | [ĐỀ XUẤT] | Admin truy cập dữ liệu nhạy cảm | Phải có purpose, audit event và quyền hỗ trợ tương ứng | Audit lưu actor/resource/reason/time |

## 3. CV và JD

| Mã | Trạng thái | Điều kiện | Hành động/Kết quả | Kiểm thử chính |
|---|---|---|---|---|
| BR-005 | [ĐÃ CHỐT] | Candidate upload CV MVP | Chỉ nhận PDF có MIME/signature hợp lệ, có text, tối đa 10 MB; file mật khẩu/hỏng/chỉ ảnh bị từ chối bằng mã lỗi xác định | Fake extension/oversize/encrypted/no-text bị từ chối rõ |
| BR-006 | [ĐÃ CHỐT] | CV/JD được thay nội dung | Tạo version mới, không ghi đè version đã dùng trong MatchingResult/Application | Result cũ vẫn trỏ đúng input version |
| BR-007 | [ĐÃ CHỐT] | Field được parser tạo | Lưu value, confidence, extraction method và evidence/source | Không có provenance → field invalid/uncertain |
| BR-008 | [ĐÃ CHỐT] | Field quan trọng confidence thấp hoặc extraction thiếu | Chuyển NeedsReview; không đưa vào matching chính thức trước user confirmation | Skill/experience/title/date/education/language thấp confidence bị chặn |
| BR-009 | [ĐÃ CHỐT] | Candidate/Recruiter xác nhận/sửa parse | Lưu actor, timestamp và before/after; confirmed data được ưu tiên | Audit và version không mất dữ liệu parser |
| BR-010 | [ĐÃ CHỐT] | Recruiter muốn publish/close Job | JobVersion active phải có title, description và ParsedJD đã confirm; chỉ Published nhận Application; Closed không mở lại trong MVP | Draft/unconfirmed không publish; Closed không nhận apply/reopen |

## 4. Taxonomy và normalization

| Mã | Trạng thái | Điều kiện | Hành động/Kết quả | Kiểm thử chính |
|---|---|---|---|---|
| BR-011 | [ĐÃ CHỐT] | Chuẩn hóa thuật ngữ | Thứ tự exact canonical → exact alias → normalized alias → candidate fuzzy/semantic → unknown | JS map JavaScript trước khi gọi LLM |
| BR-012 | [ĐÃ CHỐT] | Không đạt ngưỡng map taxonomy | Giữ raw term/evidence và tạo hoặc gộp PendingSkill | Unknown không bị bỏ mất/auto-map |
| BR-013 | [ĐÃ CHỐT] | PendingSkill trùng fingerprint | Gộp occurrence/evidence thay vì tạo duplicate | Cùng term/context không tạo N bản ghi |
| BR-014 | [ĐÃ CHỐT] | LLM trả suggestion | Chỉ lưu proposal; không tự cập nhật taxonomy | Không có admin action → taxonomy không đổi |
| BR-015 | [ĐÃ CHỐT] | Admin review PendingSkill | Chỉ được Approve, EditAndApprove, Merge, Reject hoặc Deferred; phải lưu reason | Mọi transition có audit |
| BR-016 | [ĐÃ CHỐT] | Approve/Merge taxonomy | Tạo TaxonomyVersion mới và giữ lịch sử alias/merge | Có thể tái hiện mapping của version cũ |
| BR-017 | [ĐỀ XUẤT] | Skill còn Pending/low confidence | Không dùng làm hard constraint; contribution bị loại hoặc cap ở mức thấp | Pending term không làm đảo ranking mạnh |
| BR-018 | [ĐÃ CHỐT] | Taxonomy change ảnh hưởng mapping | Đánh dấu bản parse/result stale và lập reprocess có kiểm soát | Không âm thầm sửa result cũ |

## 5. Matching và explanation

| Mã | Trạng thái | Điều kiện | Hành động/Kết quả | Kiểm thử chính |
|---|---|---|---|---|
| BR-019 | [ĐÃ CHỐT] | Tính kết quả chính thức trong sản phẩm | Chỉ chạy cho Application hợp lệ, dùng snapshot CVVersion/JobVersion confirmed và lưu mọi version/config; offline evaluation phải có ExperimentRun riêng | Không tạo personalized result trước apply; cùng input/config tái lập cùng score |
| BR-020 | [ĐÃ CHỐT] | JD có required/preferred skills | Required và preferred là component riêng, không nhập chung | Thiếu required chịu ảnh hưởng lớn hơn preferred |
| BR-021 | [ĐỀ XUẤT] | Skill xuất hiện ở nhiều vị trí CV | Evidence trong work/project > certificate/education > skill list > inference | Unit test evidence-level weighting |
| BR-022 | [ĐÃ CHỐT] | Tính kinh nghiệm liên quan | Dùng hợp của các khoảng thời gian liên quan; không cộng trùng overlap | Hai job overlap không nhân đôi số tháng |
| BR-023 | [ĐỀ XUẤT] | Không đủ ngày/tháng | Dùng độ phân giải tháng và lưu uncertainty; không tự nâng tròn năm | 2 năm 7 tháng không thành 3 năm |
| BR-024 | [ĐÃ CHỐT] | Tiêu chí JD không áp dụng | Loại khỏi mẫu số trọng số; không mặc định score 0 | JD không yêu cầu học vấn không bị trừ học vấn |
| BR-025 | [ĐÃ CHỐT] | Thiếu required/critical requirement | Áp penalty/flag theo config; không tự Rejected | Application status không đổi do score |
| BR-026 | [ĐÃ CHỐT] | Tạo final score | Chuẩn hóa `[0,100]`, lưu raw component, weight, penalty và quality flag | Breakdown khớp final trong tolerance |
| BR-027 | [ĐÃ CHỐT] | Tạo explanation | Mỗi factual claim phải trỏ ít nhất một component/evidence hoặc ghi rõ “không tìm thấy bằng chứng” | Unsupported claim rate được đo |
| BR-028 | [ĐÃ CHỐT] | LLM wording được bật | LLM chỉ nhận structured facts đã redacted; output phải validate với allow-list fact IDs | Fact lạ bị loại/fallback template |
| BR-029 | [ĐÃ CHỐT] | AI/embedding không khả dụng | Dùng fallback rule/template nếu đủ input; gắn degraded flag | Không trả score giả như bình thường |
| BR-030 | [ĐÃ CHỐT] | Algorithm/model/weight đổi | Tạo version mới; result cũ immutable; result mới link supersedes | Audit so sánh hai version |
| BR-031 | [ĐÃ CHỐT] | Matching input không đủ | Trả `INSUFFICIENT_DATA`, không ép về 0 | UI phân biệt thiếu dữ liệu và không phù hợp |

## 6. Application

| Mã | Trạng thái | Điều kiện | Hành động/Kết quả | Kiểm thử chính |
|---|---|---|---|---|
| BR-032 | [ĐÃ CHỐT] | Candidate apply Job Published | Tạo duy nhất một Application cho Candidate–Job trong toàn vòng đời và snapshot CV/Job version; không re-apply sau Rejected/Withdrawn | Double click/retry/re-apply không tạo duplicate |
| BR-033 | [ĐÃ CHỐT] | AI chưa có result khi apply | Vẫn cho ứng tuyển; matching ở trạng thái pending/null, không dùng 0 | Stop AI vẫn apply được |
| BR-034 | [ĐÃ CHỐT] | Thay đổi trạng thái Application | Chỉ cho SUBMITTED→UNDER_REVIEW/REJECTED/WITHDRAWN, UNDER_REVIEW→SHORTLISTED/REJECTED/WITHDRAWN, SHORTLISTED→REJECTED/WITHDRAWN; lưu from/to/changedBy/changedAt/reason | Terminal/reverse transition bị từ chối |
| BR-035 | [ĐÃ CHỐT] | Candidate rút đơn | Chỉ rút đơn của chính mình từ Submitted/UnderReview/Shortlisted; Withdrawn là terminal; lưu lý do và không xóa history | Withdrawn không chuyển tiếp/re-apply |
| BR-036 | [ĐÃ CHỐT] | Hệ thống tính score thấp | Không tự chuyển Rejected và không ẩn Candidate khỏi danh sách | Score 0 vẫn hiển thị với lý do/quality flag |

## 7. Privacy, fairness và LLM

| Mã | Trạng thái | Điều kiện | Hành động/Kết quả | Kiểm thử chính |
|---|---|---|---|---|
| BR-037 | [ĐÃ CHỐT] | Chuẩn bị feature matching | Loại name, photo, gender, age, DOB, address, phone, email, marital status, ethnicity, religion | Feature payload không chứa prohibited fields |
| BR-038 | [ĐÃ CHỐT] | Gửi external LLM | Chỉ gửi minimal redacted context, ghi provider/model/purpose/time theo policy | Redaction test và outbound audit |
| BR-039 | [ĐÃ CHỐT] | Data dùng nghiên cứu | Ẩn danh/pseudonymize, có quyền sử dụng và dataset version | Không thể truy trực tiếp PII từ export |
| BR-040 | [ĐÃ CHỐT] | Hiển thị ranking | Phải hiển thị đây là hỗ trợ, quality flag và không suy luận protected attributes | UI/response có disclaimer và flags |
| BR-041 | [ĐỀ XUẤT] | Đánh giá theo nhóm ngôn ngữ/vị trí | Báo metric tách nhóm khi đủ mẫu; không claim đồng đều nếu chưa đo | Report có slice table/limitation |

## 8. Async processing và audit

| Mã | Trạng thái | Điều kiện | Hành động/Kết quả | Kiểm thử chính |
|---|---|---|---|---|
| BR-042 | [ĐÃ CHỐT] | Tạo task/event | Có correlation ID, idempotency key, schema version và object reference; không chứa raw CV | Contract test payload |
| BR-043 | [ĐỀ XUẤT] | Transient failure | Retry tối đa 3 lần với backoff cấu hình; sau đó DLQ/DeadLetter | Fault injection kiểm tra số attempt |
| BR-044 | [ĐÃ CHỐT] | Consumer nhận event trùng | Trả/kết nối result cũ theo idempotency key; không tạo duplicate | Publish cùng event hai lần |
| BR-045 | [ĐÃ CHỐT] | Permanent/invalid input | Không retry vô hạn; kết thúc REJECTED hoặc FAILED với mã UNSUPPORTED_FILE_TYPE/FILE_TOO_LARGE/PASSWORD_PROTECTED/CORRUPTED_FILE/NO_TEXT_LAYER/EMPTY_CONTENT/PARSING_FAILED | File lỗi không còn Pending/Processing hoặc làm loop |
| BR-046 | [ĐÃ CHỐT] | Thay đổi dữ liệu/trạng thái quan trọng | Lưu audit append-only gồm actor/action/resource/version/time/correlation | Sửa taxonomy/status có audit đầy đủ |

## 9. Các rule cần pilot/freeze

Các rule sau chưa nên hard-code trước thí nghiệm:

- Ngưỡng fuzzy/semantic mapping trong BR-012.
- Contribution cap của PendingSkill trong BR-017.
- Evidence weights trong BR-021.
- Component weights và penalty của BR-024 đến BR-026.
- Retry/backoff cụ thể của BR-043.

Mỗi giá trị phải nằm trong Algorithm/Policy configuration có version và được chốt bằng DEC sau pilot.
