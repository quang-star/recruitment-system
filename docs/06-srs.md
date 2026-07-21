# Software Requirements Specification (SRS)

| Thuộc tính | Giá trị |
|---|---|
| Mã tài liệu | DOC-SRS-001 |
| Phiên bản | 0.2.0 |
| Trạng thái | Working baseline |

## 1. Phạm vi SRS

SRS mô tả hành vi quan sát được và các thuộc tính chất lượng của MVP. Chi tiết thuật toán nằm trong `08-ai-matching-design.md`; SRS không khóa một thư viện/model cụ thể nếu không cần cho claim.

## 2. Functional requirements

### 2.1 Identity, RBAC và Company

| Mã | Ưu tiên | Yêu cầu có thể kiểm thử | UC/BR |
|---|---|---|---|
| FR-001 | Must | Hệ thống phải cho phép đăng ký/đăng nhập và phát phiên/token theo chính sách bảo mật | UC-CAN-01, BR-001 |
| FR-002 | Must | Hệ thống phải phân quyền Candidate, Recruiter và Admin ở API, không chỉ ở UI | BR-001 |
| FR-003 | Must | Hệ thống phải kiểm tra ownership/company membership trên mọi tài nguyên tuyển dụng | UC-REC-01, BR-002 |
| FR-004 | Must | Hệ thống phải cho Recruiter tạo/cập nhật Company profile cơ bản theo quyền | UC-REC-01 |
| FR-005 | Should | Admin phải có thể activate/suspend user/company và mọi hành động phải có audit | UC-ADM-01, BR-004, BR-046 |

### 2.2 Candidate Profile và CV

| Mã | Ưu tiên | Yêu cầu có thể kiểm thử | UC/BR |
|---|---|---|---|
| FR-006 | Should | Candidate phải xem/sửa profile của mình; protected attributes không đi vào matching feature | UC-CAN-02, BR-037 |
| FR-007 | Must | Candidate phải upload được PDF hợp lệ và nhận task ID trong response | UC-CAN-03, BR-005 |
| FR-008 | Must | Hệ thống phải tạo CVVersion bất biến cho mỗi nội dung mới và lưu source hash | UC-CAN-03, BR-006 |
| FR-009 | Must | Candidate phải xem được trạng thái Uploaded/Queued/Processing/Parsed/NeedsReview/Failed/Confirmed | UC-CAN-03 |
| FR-010 | Must | Candidate phải xem ParsedCV theo field kèm confidence, provenance và evidence | UC-CAN-04, BR-007 |
| FR-011 | Must | Candidate phải sửa/xác nhận ParsedCV và hệ thống phải lưu audit before/after | UC-CAN-04, BR-009 |
| FR-012 | Must | Hệ thống chỉ dùng bản CV confirmed làm input chính thức, trừ khi response ghi rõ provisional | BR-019 |
| FR-013 | Should | Candidate phải chọn được CVVersion active và xem lịch sử version của mình | UC-CAN-04 |
| FR-014 | Should | Candidate phải có thể yêu cầu ngừng sử dụng/xóa CV theo retention policy đã chốt | BR-003, BR-039 |

### 2.3 Job/JD

| Mã | Ưu tiên | Yêu cầu có thể kiểm thử | UC/BR |
|---|---|---|---|
| FR-015 | Must | Recruiter phải tạo Job Draft với title và raw JD/form | UC-REC-02 |
| FR-016 | Must | Hệ thống phải tạo JobVersion khi nội dung JD thay đổi | UC-REC-02, BR-006 |
| FR-017 | Must | Recruiter phải xem ParsedJD theo field kèm confidence/evidence | UC-REC-03, BR-007 |
| FR-018 | Must | Recruiter phải sửa/xác nhận required/preferred skills, experience, level và các yêu cầu khác | UC-REC-03, BR-009 |
| FR-019 | Must | Hệ thống chỉ cho publish khi JobVersion/ParsedJD đạt điều kiện BR-010 | UC-REC-04, BR-010 |
| FR-020 | Must | Recruiter phải close Job theo state machine và quyền Company; Closed không reopen và vẫn cho xử lý Application cũ | UC-REC-04, BR-002, BR-010 |
| FR-021 | Must | Chỉ Job Published xuất hiện trong danh sách Candidate và nhận Application mới | UC-CAN-05, UC-CAN-07 |

### 2.4 Application

| Mã | Ưu tiên | Yêu cầu có thể kiểm thử | UC/BR |
|---|---|---|---|
| FR-022 | Must | Candidate phải apply Job Published bằng CVVersion đã chọn và consent chia sẻ | UC-CAN-07, BR-032 |
| FR-023 | Must | Mỗi Candidate chỉ có một Application cho một Job trong toàn vòng đời; không re-apply sau Rejected/Withdrawn | UC-CAN-07, BR-032 |
| FR-024 | Must | Hệ thống phải cho apply khi AI unavailable và đánh dấu matching Pending | UC-CAN-07, BR-033 |
| FR-025 | Must | Recruiter phải xem toàn bộ applications của Job thuộc Company với pagination | UC-REC-05, BR-002 |
| FR-026 | Must | Recruiter chỉ được cập nhật UNDER_REVIEW/SHORTLISTED/REJECTED theo transition đã freeze; history lưu from/to/changedBy/changedAt và reason khi reject | UC-REC-07, BR-034, BR-046 |
| FR-027 | Must | Candidate phải theo dõi history và withdraw application của chính mình từ SUBMITTED/UNDER_REVIEW/SHORTLISTED; lưu reason | UC-CAN-08, BR-035 |
| FR-028 | Must | Score/AI không được tự tạo transition Rejected hoặc ẩn application | BR-036 |

### 2.5 CV/JD parsing

| Mã | Ưu tiên | Yêu cầu có thể kiểm thử | UC/BR |
|---|---|---|---|
| FR-029 | Must | Worker phải extract text và ngôn ngữ từ PDF text/JD text | UC-AI-01, UC-AI-02 |
| FR-030 | Must | Worker phải tạo ParsedCV theo schema version gồm skills, experience, projects, education, certificates, languages | UC-AI-01 |
| FR-031 | Must | Worker phải tạo ParsedJD theo schema version gồm title/level, responsibilities, required/preferred skills, experience, education/language | UC-AI-02 |
| FR-032 | Must | Mọi field máy trích xuất phải có confidence, method và zero-or-more evidence spans | BR-007 |
| FR-033 | Must | File invalid kết thúc REJECTED, parse lỗi kết thúc FAILED; task không được treo Pending/Processing và phải trả mã lỗi chuẩn | UC-AI-01, UC-AI-02, BR-045 |
| FR-034 | Should | Hệ thống phải báo parsing metric theo field, ngôn ngữ và document version trong evaluation workspace | RQ-01 |

Kết quả parser ban đầu và revision do người dùng sửa/xác nhận phải được lưu tách biệt, immutable theo revision. Các field quan trọng confidence thấp không được dùng cho matching chính thức trước khi xác nhận.

### 2.6 Taxonomy và normalization

| Mã | Ưu tiên | Yêu cầu có thể kiểm thử | UC/BR |
|---|---|---|---|
| FR-035 | Must | Hệ thống phải quản lý Skill canonical, category/type, alias, relation và trạng thái | UC-ADM-02 |
| FR-036 | Must | Normalizer phải áp dụng pipeline exact→alias→candidate fuzzy/semantic→unknown | UC-AI-03, BR-011 |
| FR-037 | Must | Unknown term phải giữ raw/evidence và tạo/gộp PendingSkill | UC-AI-03, BR-012, BR-013 |
| FR-038 | Should | Hệ thống có thể gọi LLM để đề xuất structured candidate sau redaction; lỗi LLM không chặn workflow | UC-ADM-03, BR-014, BR-038 |
| FR-039 | Must | Admin phải approve, edit-and-approve, merge, reject hoặc defer PendingSkill | UC-ADM-03, BR-015 |
| FR-040 | Must | Approve/merge phải tạo TaxonomyVersion và audit | UC-ADM-03, BR-016 |
| FR-041 | Should | Taxonomy change phải tạo impact list và batch reprocessing, không sửa result cũ | UC-AI-06, BR-018 |

### 2.7 Matching, search và explanation

| Mã | Ưu tiên | Yêu cầu có thể kiểm thử | UC/BR |
|---|---|---|---|
| FR-042 | Must | Hệ thống phải tính required/preferred skill, experience, title/level, semantic responsibility và applicable education/language components | UC-AI-04 |
| FR-043 | Must | Hệ thống phải loại tiêu chí không áp dụng khỏi denominator và lưu applicable flag | BR-024 |
| FR-044 | Must | Hệ thống phải áp penalty có version cho missing critical requirement mà không auto-reject | BR-025, BR-036 |
| FR-045 | Must | Hệ thống phải lưu final score `[0,100]`, component score, weight, penalty, confidence và flags | UC-AI-04, BR-026 |
| FR-046 | Must | Mỗi MatchingResult phải trỏ CVVersion, JobVersion, taxonomy, schema, model và algorithm version | BR-019, BR-030 |
| FR-047 | Must | MatchingResult đã phát hành phải immutable; recompute tạo result mới | UC-AI-06, BR-030 |
| FR-048 | Must | Candidate phải duyệt/tìm Job Published bằng pagination/filter mà không có personalized ranking trước apply | UC-CAN-05 |
| FR-049 | Must | Recruiter phải nhận ranking của applications theo Job; Pending/Failed vẫn hiện | UC-REC-05, BR-036 |
| FR-050 | Must | API/UI phải phân biệt Completed, Processing, Degraded và InsufficientData | BR-029, BR-031 |
| FR-051 | Must | Hệ thống phải tạo matched, missing và uncertain criteria từ component facts | UC-AI-05 |
| FR-052 | Must | Mỗi factual explanation claim phải trỏ fact/component/evidence ID hoặc là câu limitation chuẩn | BR-027 |
| FR-053 | Should | LLM wording phải qua schema/fact allow-list validation và fallback template | BR-028 |
| FR-054 | Must | Explanation LLM lỗi/disabled không được làm đổi score hoặc chặn hiển thị template | BR-028, BR-029 |

### 2.8 Admin, audit và research

| Mã | Ưu tiên | Yêu cầu có thể kiểm thử | UC/BR |
|---|---|---|---|
| FR-055 | Must | Admin phải xem task Failed/DeadLetter và retry có lý do | UC-ADM-04 |
| FR-056 | Should | Admin phải tra cứu audit theo actor/resource/action/correlation/time | UC-ADM-05, BR-046 |
| FR-057 | Must | Hệ thống phải lưu dataset/annotation/experiment metadata theo version | RQ-01 đến RQ-06 |
| FR-058 | Must | Evaluation export phải pseudonymize và không chứa PII bị cấm | BR-039 |
| FR-059 | Must | Hệ thống phải xuất component-level result phục vụ metric/error analysis | RQ-02 đến RQ-04 |
| FR-060 | Should | Hệ thống phải đánh dấu position/language slice thuộc phạm vi Evaluated hay chưa | BR-041 |

### 2.9 Async processing

| Mã | Ưu tiên | Yêu cầu có thể kiểm thử | UC/BR |
|---|---|---|---|
| FR-061 | Must | Core phải tạo event/task bằng transactional outbox hoặc cơ chế tương đương chống mất sự kiện | BR-042 |
| FR-062 | Must | Event phải có eventId, correlationId, idempotencyKey, schemaVersion, occurredAt và object reference | BR-042 |
| FR-063 | Must | Consumer phải idempotent và trả result hiện có khi event trùng | BR-044 |
| FR-064 | Must | Lỗi transient phải retry hữu hạn; lỗi permanent/invalid không retry vô hạn | BR-043, BR-045 |
| FR-065 | Must | Raw CV/JD và PII không được đặt trực tiếp trong message payload | BR-037, BR-042 |

## 3. Non-functional requirements

Các ngưỡng dưới đây là **[ĐỀ XUẤT]** và phải được hiệu chỉnh sau pilot trên môi trường benchmark được ghi cấu hình.

### 3.1 Performance và capacity

| Mã | Yêu cầu/Target | Cách xác minh |
|---|---|---|
| NFR-001 | Upload API trả task ID p95 ≤ 2 giây, không chờ parsing | Load/integration test |
| NFR-002 | Parse PDF text ≤10 MB có p95 ≤ 30 giây ở worker cấu hình demo, không tính thời gian user review | Timed benchmark |
| NFR-003 | Tính một cặp matching đã có embedding có p95 ≤ 1 giây | Benchmark 1,000+ pairs |
| NFR-004 | Trả Top-10 trên tập 10,000 vectors có p95 ≤ 2 giây ở cấu hình benchmark | k6/locust + pgvector plan |
| NFR-005 | API danh sách dùng pagination; page size mặc định 20, tối đa 100 | API contract test |
| NFR-006 | File PDF MVP tối đa 10 MB; giới hạn cấu hình và trả 413 khi vượt | Boundary test |

### 3.2 Reliability và recoverability

| Mã | Yêu cầu/Target | Cách xác minh |
|---|---|---|
| NFR-007 | Consumer idempotent: cùng event ≥2 lần chỉ tạo một logical result | Duplicate delivery test |
| NFR-008 | Transient task retry tối đa 3 lần với backoff cấu hình; sau đó DeadLetter | Fault injection |
| NFR-009 | ≥99% task hợp lệ trong benchmark kết thúc Completed hoặc NeedsReview, không mất trạng thái | Batch reconciliation |
| NFR-010 | AI Service down không chặn login, job view hoặc apply; score hiển thị Pending/Unavailable | Service isolation test |
| NFR-011 | Mọi state-changing request quan trọng hỗ trợ optimistic concurrency hoặc idempotency | Concurrent request test |
| NFR-012 | Backup/restore demo database và object metadata được diễn tập trước bảo vệ | Restore checklist |

### 3.3 Security và privacy

| Mã | Yêu cầu/Target | Cách xác minh |
|---|---|---|
| NFR-013 | Mật khẩu hash bằng thuật toán thích hợp (Argon2id/bcrypt cấu hình an toàn); không log credential/token | Security review |
| NFR-014 | API enforce RBAC/ownership; zero known privilege-escalation trong test matrix | Authorization tests |
| NFR-015 | TLS bắt buộc ngoài local demo; secret chỉ qua environment/secret store, không commit | Config/repo scan |
| NFR-016 | PII bị cấm không xuất hiện trong matching feature, embedding text, event hoặc evaluation export | Automated redaction assertions |
| NFR-017 | External LLM request chỉ chứa minimal redacted context và có provider/model/purpose audit | Outbound contract test |
| NFR-018 | CV object dùng private access và signed/authorized retrieval; không public URL | Storage access test |
| NFR-019 | Retention/delete policy phải được freeze trước dữ liệu thật; deletion job có audit | Policy/test |

### 3.4 Explainability, fairness và reproducibility

| Mã | Yêu cầu/Target | Cách xác minh |
|---|---|---|
| NFR-020 | 100% explanation factual claims có fact/component/evidence ID hoặc limitation code | Automated validator |
| NFR-021 | Unsupported-claim rate trên tập explanation test ≤ 5% và không có protected-attribute claim | Human + automated audit |
| NFR-022 | Cùng input/config/version cho score giống nhau trong sai số số thực định nghĩa | Reproducibility test |
| NFR-023 | Mỗi report metric ghi dataset split, code commit, schema/taxonomy/model/algorithm version và seed | Experiment record review |
| NFR-024 | Báo metric theo language/position slice khi mỗi slice đạt cỡ mẫu tối thiểu; nếu không phải ghi limitation | Report checklist |

### 3.5 Scalability và maintainability

| Mã | Yêu cầu/Target | Cách xác minh |
|---|---|---|
| NFR-025 | AI Worker stateless theo task và có thể tăng replica mà không tạo duplicate result | Multi-worker test |
| NFR-026 | API/event/schema thay đổi phải versioned và tương thích ngược trong cùng major version | Contract test |
| NFR-027 | Service không đọc trực tiếp database thuộc bounded context khác | Architecture test/review |
| NFR-028 | Mọi request/task có correlation ID; structured logs không chứa raw CV/PII | Log inspection |
| NFR-029 | Critical-path unit/integration/contract test coverage theo rủi ro; không dùng một phần trăm coverage duy nhất làm DoD | Test report |
| NFR-030 | Hệ thống phải chạy được bằng Docker Compose trên máy demo được ghi cấu hình với một quy trình setup tái lập | Fresh-machine rehearsal |

### 3.6 Usability và ngôn ngữ

| Mã | Yêu cầu/Target | Cách xác minh |
|---|---|---|
| NFR-031 | UI phải phân biệt “không có bằng chứng”, “đang xử lý”, “lỗi” và “điểm thấp” | UX acceptance test |
| NFR-032 | Candidate/Recruiter phải sửa field parse và xem source evidence trong tối đa 3 thao tác từ màn kết quả | Task-based test |
| NFR-033 | Label/UI cốt lõi hỗ trợ tiếng Việt; dữ liệu CV/JD Việt–Anh/mixed không làm lỗi Unicode | I18n/fixture test |
| NFR-034 | Error message cho user có action tiếp theo và không lộ stack trace/model secret | Negative test |

## 4. Requirement acceptance policy

- Must FR chỉ Done khi có test hoặc demo script quan sát được.
- NFR có số phải ghi môi trường, dataset và percentile/window đo.
- Nếu target pilot không đạt, không âm thầm hạ target: tạo DEC, phân tích nguyên nhân và limitation.
- Một tính năng có UI nhưng không có rule/data/test tương ứng chưa được coi là Done.
