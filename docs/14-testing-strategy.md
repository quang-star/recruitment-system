# Testing Strategy

| Thuộc tính | Giá trị |
|---|---|
| Mã tài liệu | DOC-TEST-001 |
| Phiên bản | 0.2.0 |
| Trạng thái | Working baseline |

## 1. Mục tiêu

Tách rõ hai loại kiểm chứng:

- **Software verification**: hệ thống thực hiện đúng FR/BR/NFR và an toàn khi lỗi.
- **Research evaluation**: phương pháp có chất lượng ra sao trên dataset/baseline, nằm trong `10-evaluation-plan.md`.

Một API chạy được không chứng minh phương pháp tốt; một notebook có metric tốt cũng không chứng minh hệ thống đúng nghiệp vụ.

## 2. Test layers

| Layer | Phạm vi | Ví dụ |
|---|---|---|
| Unit | Rule/function/entity transition | Date interval union, penalty, alias normalization |
| Schema/validation | Parsed/event/API payload | Invalid enum/range/missing evidence/version |
| Component | Service + DB/dependency giả/local | Parser fixture, matching repository |
| Contract | Producer–consumer/API | OpenAPI/event v1 backward compatibility |
| Integration | DB/RabbitMQ/Object Storage thật qua container | Outbox→queue→worker→result |
| E2E | Candidate/Recruiter/Admin critical flows | Upload→confirm→match→apply→rank |
| Security/privacy | Authz, PII, storage, log | Cross-company access, outbound redaction |
| Resilience | Failure/duplicate/retry | Worker crash, broker down, poison message |
| Performance | NFR workload | p95 upload/match/top-K, worker throughput |
| AI regression | Frozen fixtures/dataset slices | Parsing F1/ranking/explanation không tụt quá gate |

## 3. Critical-path test matrix

| Test ID group | Requirement/rule | Scenario bắt buộc |
|---|---|---|
| TC-AUTH-* | FR-001..005, BR-001..004 | Role/ownership/cross-company/admin audit |
| TC-CV-* | FR-007..014, BR-005..009 | File boundary, duplicate upload, scan, confirm revision |
| TC-JOB-* | FR-015..021, BR-006..010 | Draft/confirm/publish/version/close race |
| TC-TAX-* | FR-035..041, BR-011..018 | Alias, unknown, concurrent approve, merge cycle, version |
| TC-MAT-* | FR-042..054, BR-019..031 | Applicable weights, overlap, penalty, insufficient/degraded, evidence |
| TC-APP-* | FR-022..028, BR-032..036 | Duplicate apply, Job closes, AI down, state transitions |
| TC-ASYNC-* | FR-061..065, BR-042..046 | Outbox, duplicate delivery, retry, DLQ, no PII payload |
| TC-PRIV-* | NFR-013..019 | Feature/event/log/LLM/storage PII assertions |
| TC-EXP-* | NFR-020..024 | Fact linkage, reproducibility metadata, slice limitation |

## 4. Unit test priorities

### Matching

- Weight renormalization khi component không applicable.
- `Σ component - penalty` khớp final trong tolerance.
- Không đủ denominator → InsufficientData.
- Missing critical tạo flag/penalty nhưng không application transition.
- PendingSkill không thành hard match.
- Same input/version cho cùng logical result.

### Experience

- Adjacent/overlapping/nested/current intervals.
- Missing month/day, invalid/future date.
- Hai job song song không cộng trùng.
- Relevant vs unrelated experience.

### Normalization

- `JS`, `ReactJS`, `Postgres`, `Nodejs`, `.NET`, `C#`, `C++`.
- Ambiguous alias theo context.
- Unicode/case/punctuation.
- Duplicate PendingSkill fingerprint.
- Merge cycle/redirect.

### Explanation

- Mỗi claim có fact/component/evidence.
- Negation/số năm/skill entity không mâu thuẫn.
- Không có evidence → wording “không tìm thấy bằng chứng”.
- LLM invalid/timeout → template không đổi score.

## 5. Integration và contract tests

Sử dụng dependency thật dạng disposable container khi có thể:

- PostgreSQL/pgvector.
- RabbitMQ.
- MinIO nếu được chọn.

Contract test bắt buộc:

- OpenAPI request/response/error examples.
- Event envelope và payload schema version.
- Consumer bỏ qua optional field mới trong cùng major version.
- Breaking change bị chặn hoặc yêu cầu major version.
- Raw document/PII không có trong event.

## 6. E2E scenarios

### E2E-01 Candidate happy path

Register/login → upload text PDF → review/confirm ParsedCV → browse Job Published không personalized → apply khi AI down → track Submitted/Pending → AI xử lý → xem own explanation → withdraw với reason → terminal.

### E2E-02 Recruiter happy path

Create Company/Job Draft → parse/review ParsedJD → publish → Candidate apply → view ranking/evidence → Submitted→UnderReview→Shortlisted→Rejected với history/reason; đóng Job vẫn xử lý Application cũ nhưng không nhận apply mới.

### E2E-02B Workflow guards

Chặn duplicate/re-apply Candidate–Job, Rejected/Withdrawn transition tiếp, Shortlisted→UnderReview, Closed→Published và mọi status change do matching score.

### E2E-03 Unknown technology

CV/JD có term mới → PendingSkill → optional LLM suggestion → Admin merge/approve → taxonomy version → reprocess result mới, result cũ còn xem được.

### E2E-04 AI unavailable

Stop AI → Candidate vẫn xem Job/apply → status Pending → restart worker → task hoàn tất đúng một result.

### E2E-05 Security boundary

Recruiter Company A truy cập Job/Application/CV Company B → forbidden + security audit; Candidate khác không đọc CV/task.

## 7. Test data

- Fixtures kỹ thuật là synthetic, nhỏ, versioned và không có PII thật.
- Evaluation dataset không dùng trực tiếp trong mọi unit test; chỉ AI regression/evaluation có quyền.
- Seed demo tách khỏi test set để tránh “học thuộc” demo.
- Golden outputs chỉ dùng cho deterministic schema/rule; model output so bằng metric/tolerance, không snapshot câu chữ mong manh.

## 8. AI regression gate

Mỗi thay đổi parser/taxonomy/model/algorithm chạy:

1. Schema validation suite.
2. Frozen smoke fixtures.
3. Parsing field metrics.
4. Ranking validation metrics.
5. Explanation fact-link validator.
6. Latency/cost sample.
7. Slice/known regression report.

Không chạy/tune lặp trên final test. Regression gate dùng development/validation; final test chỉ theo protocol đã freeze.

## 9. Security/privacy tests

- Password/token/secret không xuất hiện trong log/repo artifact.
- Object URL private/expired; IDOR trên CV/task/result bị chặn.
- JWT signature/issuer/audience/expiry và role/ownership.
- Upload fake MIME, oversized, encrypted/malformed PDF.
- Event/embedding text/evaluation export không chứa prohibited fields.
- External LLM adapter redacts PII và không gửi full raw document.
- Prompt injection text trong CV/JD chỉ là dữ liệu, không thay system instruction/tool behavior.
- Rate limit auth/upload/LLM/expensive recompute.

## 10. Resilience tests

| Fault | Expected |
|---|---|
| Duplicate event | Một logical result, attempts/audit hợp lệ |
| Worker chết trước/sau DB commit | Redelivery không duplicate/mất result |
| RabbitMQ down lúc business commit | Outbox pending; publish sau phục hồi |
| AI DB timeout | Retry hữu hạn; Core không mất Application |
| LLM timeout/invalid JSON | Local/template fallback |
| Poison file/message | Failed/DeadLetter, không loop |
| Taxonomy update lớn | Batch checkpoint/rate limit; result cũ còn phục vụ |

## 11. Performance tests

Ánh xạ NFR-001..006 và EXP-PERF-01. Mỗi report ghi:

- Workload/script/version.
- Data/vector/document distribution.
- Concurrency/warm-up/duration.
- CPU/RAM/disk/network.
- p50/p95/p99, throughput, error/retry.
- Bottleneck và query plan nếu liên quan.

## 12. Quality gates theo milestone

| Mốc | Gate |
|---|---|
| Contract freeze | Schema fixtures/validation và compatibility pass |
| Parser baseline | Critical field tests + pilot metric có error analysis |
| Matching baseline | Rule/formula unit tests + baseline artifacts |
| Integration | E2E-01..03 pass, audit/version đúng |
| Feature freeze | Must FR tests pass; zero known privilege escalation/data leak |
| Defense release | E2E-01..05, fault/load rehearsal, final experiment artifacts |

## 13. Báo cáo lỗi và bằng chứng

Mỗi failure ghi:

- Test/requirement/version.
- Input fixture/dataset ref đã ẩn danh.
- Expected/actual.
- Correlation/task/result IDs.
- Severity và root cause.
- Fix commit và regression test.

Không dùng “test coverage cao” thay cho critical-path coverage. Coverage số chỉ là chỉ báo phụ.
