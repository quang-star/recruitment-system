# Requirement Traceability Matrix

| Thuộc tính | Giá trị |
|---|---|
| Mã tài liệu | DOC-RTM-001 |
| Phiên bản | 0.2.0 |
| Trạng thái | Working baseline |

## 1. Mục đích

Ma trận này trả lời ba câu hỏi:

1. Mỗi chức năng/thiết kế phục vụ mục tiêu nào?
2. Mỗi mục tiêu được kiểm chứng bằng test/thí nghiệm nào?
3. Khi một quyết định thay đổi, phải cập nhật những tài liệu/hợp đồng nào?

## 2. Business objective → process/use case

| BO | Process | Use case | FR chính | Kết quả kiểm chứng |
|---|---|---|---|---|
| BO-01 Candidate hiểu mức phù hợp của Application | BP-02, BP-04, BP-05 | UC-CAN-03..07 | FR-007..014, FR-042..054 | E2E Candidate post-apply + EXP-MAT/EVD |
| BO-02 Recruiter sàng lọc nhất quán | BP-01, BP-04, BP-06 | UC-REC-02..07 | FR-015..028, FR-042..054 | E2E Recruiter + ranking metric |
| BO-03 Giảm nhập lại | BP-01, BP-02 | UC-AI-01..03, UC-CAN-04, UC-REC-03 | FR-029..041 | EXP-PAR-01, EXP-NOR-01 |
| BO-04 Taxonomy thích nghi | BP-03 | UC-ADM-02/03, UC-AI-03/06 | FR-035..041 | EXP-TAX-01 + audit/version test |
| BO-05 Privacy/fairness | Tất cả | Tất cả actor có dữ liệu | FR-002..005, FR-058, FR-065 | NFR-013..024, security/redaction tests |

## 3. Research objective/question → experiment

| RO | RQ | Method artifact | Experiment | Metric/Output |
|---|---|---|---|---|
| RO-01 | RQ-01 | ParsedCV/ParsedJD v1, parser | EXP-PAR-01 | Field/entity P/R/F1, error slices |
| RO-02 | RQ-01, RQ-05 | Taxonomy/normalizer/PendingSkill | EXP-NOR-01, EXP-TAX-01 | Top-k accuracy, action accuracy, review time |
| RO-03 | RQ-02, RQ-03 | Components/formula/penalty | EXP-MAT-01..03 | nDCG@5, MRR, Recall@10, ablation delta |
| RO-04 | RQ-04 | Fact/evidence explanation contract | EXP-EVD-01 | Evidence precision, unsupported claims, rubric |
| RO-05 | RQ-02 | BL-01..BL-05 | EXP-MAT-01 | Paired ranking comparison |
| RO-06 | RQ-01..06 | Experiment records/error analysis | All | Reproducible artifacts, limitations |

## 4. End-to-end core trace

| Flow | BP | UC | BR | FR | Entity | Test/EXP |
|---|---|---|---|---|---|---|
| Upload CV | BP-02 | UC-CAN-03 | BR-005..008, BR-042..045 | FR-007..009, FR-061..065 | CV, CVVersion, ProcessingTask | TC-CV upload/idempotency/failure |
| Parse/confirm CV | BP-02 | UC-CAN-04, UC-AI-01/03 | BR-007..018, BR-037 | FR-010..014, FR-029..040 | ParsedCV, Evidence, Skill, PendingSkill | EXP-PAR-01, EXP-NOR-01 |
| Create/confirm JD | BP-01 | UC-REC-02/03/04, UC-AI-02/03 | BR-006..018 | FR-015..021, FR-029..041 | Job, JobVersion, ParsedJD | Parsing/permission/publish tests |
| Approve term | BP-03 | UC-ADM-03 | BR-011..018, BR-038, BR-046 | FR-035..041, FR-056 | PendingSkill, TaxonomyVersion | EXP-TAX-01 + concurrency/audit |
| Match/explain | BP-04 | UC-AI-04/05/06 | BR-019..031 | FR-042..054 | MatchingResult, Component, Evidence, AlgorithmVersion | EXP-MAT-01..03, EXP-EVD-01 |
| Browse/apply/post-apply result | BP-05 | UC-CAN-05..08 | BR-019..036 | FR-022..028, FR-048..054 | Application, MatchingResult | Candidate E2E + AI-down test |
| Applicant ranking | BP-06 | UC-REC-05..07 | BR-002/003, BR-019..040 | FR-025..028, FR-049..054 | ApplicationHistory, MatchingResult | Recruiter E2E + authz tests |
| Retry/recover | BP-07 | UC-ADM-04, UC-AI-06 | BR-042..046 | FR-055, FR-061..065 | ProcessingTask, Outbox | EXP-RES-01, duplicate/DLQ tests |

## 5. FR group coverage

| FR range | Requirement area | Use case coverage | Backlog coverage |
|---|---|---|---|
| FR-001..005 | Auth/RBAC/Company | UC-CAN-01, UC-REC-01, UC-ADM-01 | US-027, US-032 |
| FR-006..014 | Profile/CV | UC-CAN-02..04 | US-028, US-029 |
| FR-015..021 | Job/JD | UC-REC-02..04 | US-033, US-034 |
| FR-022..028 | Application | UC-CAN-07/08, UC-REC-05/07 | US-031, US-035, US-036 |
| FR-029..034 | Parsing | UC-AI-01/02 | US-011..013, US-017 |
| FR-035..041 | Taxonomy | UC-AI-03/06, UC-ADM-02/03 | US-014..016, US-037..040 |
| FR-042..054 | Matching/explanation | UC-CAN-05/06, UC-REC-05/06, UC-AI-04/05 | US-018..026, US-030, US-035 |
| FR-055..060 | Admin/research | UC-ADM-04/05 | US-046..050 |
| FR-061..065 | Async | UC-CAN-03, UC-AI-01..06, UC-ADM-04 | US-041..045 |

## 6. NFR verification

| NFR range | Quality | Verification artifact |
|---|---|---|
| NFR-001..006 | Performance/capacity | EXP-PERF-01, load report |
| NFR-007..012 | Reliability/recovery | EXP-RES-01, duplicate/fault/restore tests |
| NFR-013..019 | Security/privacy | RBAC matrix tests, secret scan, redaction/outbound/storage tests |
| NFR-020..024 | Explainability/reproducibility | EXP-EVD-01, experiment record audit, slice report |
| NFR-025..030 | Scale/maintainability | Multi-worker, contract, architecture fitness, fresh Compose rehearsal |
| NFR-031..034 | UX/language/error | Task-based UX, vi/en fixtures, negative tests |

## 7. Decision impact map

| Decision | Nếu thay đổi, cập nhật tối thiểu |
|---|---|
| Tên/RQ/scope | Vision, Evaluation, Backlog, RTM, thesis outline |
| Job families evaluated | Dataset/split/guideline, metrics slices, claim/UI limitation |
| Parsed schema | Parser, confirmation UI, entity/evidence, API/event, dataset annotations |
| Taxonomy model | Normalizer, PendingSkill, matching components, reprocess, EXP-NOR/TAX |
| Weight/penalty | AlgorithmVersion, tests, EXP-MAT-02/03, explanation wording |
| Embedding model | Embedding store, re-embed, AlgorithmVersion, performance/retrieval EXP |
| LLM provider/use | Privacy, outbound audit, fallback, cost/latency, EXP-EVD/TAX |
| Auth service boundary | Architecture, token/RBAC, deployment, contracts, backlog |
| Retention/consent | Context/RBAC, data design, UI/API, dataset/export, NFR tests |

## 8. Coverage gaps còn mở

| Gap | Trạng thái | Cách đóng |
|---|---|---|
| Nguồn/quyền dữ liệu chưa chốt | [CẦN XÁC NHẬN] | DEC-011 + consent/source registry |
| Cỡ mẫu và 3 hay 5 job families | [CẦN XÁC NHẬN] | Pilot coverage report + GVHD freeze |
| Auth Service riêng | [ĐÃ CHỐT] | DEC-006; contract tại DOC-API-001 |
| Hạ tầng local/MVP | [ĐÃ CHỐT] | DEC-007..010, DEC-020..023 |
| Đầu vào parsing | [ĐÃ CHỐT] | DEC-015; FR-029..034; BR-005..009, BR-045 |
| Application workflow | [ĐÃ CHỐT] | DEC-024; BR-032..036; FR-022..028 |
| Annotation protocol | [ĐÃ CHỐT MỘT PHẦN] | DEC-013/014; còn định danh annotator/adjudicator trước pilot |
| Retention raw CV | [CẦN XÁC NHẬN] | Privacy decision trước dữ liệu thật |
| Weight/penalty thresholds | [ĐỀ XUẤT] | Validation + EXP-MAT-02/03 |
| External LLM trong Must demo | [ĐÃ CHỐT] | DEC-009: Should, core/template fallback là Must |

## 9. Quy tắc duy trì RTM

- Thêm Must FR mà không có UC/test/backlog là lỗi baseline.
- Thêm RQ mà không có experiment/metric là không hợp lệ.
- Loại story không được làm mất coverage của Must FR/RQ.
- Mỗi release/milestone review coverage gaps và cập nhật status.


