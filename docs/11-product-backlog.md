# Product Backlog và Roadmap

| Thuộc tính | Giá trị |
|---|---|
| Mã tài liệu | DOC-BL-001 |
| Phiên bản | 0.2.0 |
| Trạng thái | Working research-first backlog |

## 1. Nguyên tắc ưu tiên

1. Data contract và evaluation đi trước UI/microservice polish.
2. Rule/lexical baseline phải chạy trước hybrid.
3. LLM là Should; fallback local/template là Must.
4. Auth/CRUD chỉ đủ cho hai luồng demo cốt lõi.
5. Không bắt đầu Could nếu Must research/evaluation chưa có kết quả.

Story points chỉ là độ phức tạp tương đối cho một người: 1, 2, 3, 5, 8, 13.

## 2. Epic map

| Epic | Mục tiêu | Cut-line |
|---|---|---|
| EP-01 | Scope, data contract và reproducibility | Must |
| EP-02 | Dataset, annotation và baseline | Must |
| EP-03 | Parsing và normalization | Must |
| EP-04 | Hybrid matching và explanation | Must |
| EP-05 | Candidate workflow | Must |
| EP-06 | Recruiter workflow | Must |
| EP-07 | Admin taxonomy workflow | Must |
| EP-08 | Async/resilience/observability | Must tối thiểu |
| EP-09 | Evaluation và thesis artifacts | Must |
| EP-10 | Scale/UX extensions | Should/Could |

## 3. Backlog

### EP-01 — Scope và contracts

| ID | User story/Deliverable | Acceptance criteria rút gọn | Pri | Dep | SP |
|---|---|---|---:|---|---:|
| US-001 | Là tác giả, tôi muốn freeze title/RQ/scope để tránh scope creep | GVHD xác nhận; DEC cập nhật; evaluated scope rõ | Must | – | 3 |
| US-002 | Là AI/Core dev, tôi muốn ParsedCV v1 contract | Schema validation + fixtures vi/en/mixed + version | Must | US-001 | 5 |
| US-003 | Tôi muốn ParsedJD v1 contract | Required/preferred/evidence/confidence test được | Must | US-001 | 5 |
| US-004 | Tôi muốn taxonomy v1 và alias seed | Nhóm skill CNTT, stable IDs, version/import validation | Must | US-001 | 8 |
| US-005 | Tôi muốn Experiment Record và config version | Một smoke run tái lập từ record | Must | US-002..004 | 3 |

### EP-02 — Dataset, annotation và baseline

| ID | User story/Deliverable | Acceptance criteria rút gọn | Pri | Dep | SP |
|---|---|---|---:|---|---:|
| US-006 | Thu thập smoke/pilot CV-JD hợp lệ | Có source right, anonymization, hash, metadata | Must | US-001 | 8 |
| US-007 | Xây annotation guideline parsing | 10 mẫu double-label; disagreement log | Must | US-002,003,006 | 5 |
| US-008 | Xây relevance rubric 0–4 | Pilot 50–100 cặp; annotator blind; UNSURE ngoài thang; agreement trước adjudication | Must | US-006 | 5 |
| US-009 | Tạo dataset split chống leakage | Group key/split hash/version cố định | Must | US-006..008 | 5 |
| US-010 | Cài rule-only/TF-IDF/BM25 baseline | Cùng input/split; raw predictions lưu artifact | Must | US-004,009 | 8 |

### EP-03 — Parsing và normalization

| ID | User story/Deliverable | Acceptance criteria rút gọn | Pri | Dep | SP |
|---|---|---|---:|---|---:|
| US-011 | PDF text extraction + offset map | PDF text ≤10 MB; vi/en/mixed; mã lỗi scan/encrypted/hỏng/empty; terminal state đúng | Must | US-002 | 8 |
| US-012 | CV section/entity parser | Tạo schema-valid fields/evidence/confidence | Must | US-002,011 | 13 |
| US-013 | JD parser | Required/preferred/level/experience có evidence | Must | US-003 | 13 |
| US-014 | Alias/exact normalizer | JS/ReactJS/Postgres/.NET/C# test đúng | Must | US-004 | 8 |
| US-015 | Unknown term/PendingSkill detector | Không drop term; fingerprint/deduplicate | Must | US-004,014 | 5 |
| US-016 | Human confirm revision | User edit/audit/provenance và event confirm | Must | US-012,013 | 8 |
| US-017 | Parsing evaluation pipeline | P/R/F1 field/language + error export | Must | US-007,012,013 | 8 |

### EP-04 — Hybrid matching và explanation

| ID | User story/Deliverable | Acceptance criteria rút gọn | Pri | Dep | SP |
|---|---|---|---:|---|---:|
| US-018 | Multilingual embedding benchmark | Model/config version; retrieval result trên validation | Must | US-009 | 8 |
| US-019 | Rule component engine | Skill/experience/title/applicable tests | Must | US-014,016 | 13 |
| US-020 | Semantic responsibility component | Section pairs/evidence/model version lưu được | Must | US-018 | 8 |
| US-021 | Aggregation/penalty engine | Formula/weights config; score breakdown khớp | Must | US-019,020 | 8 |
| US-022 | Immutable MatchingResult/versioning | Idempotent tuple; supersedes history | Must | US-021 | 8 |
| US-023 | Template evidence explanation | 100% factual claim có fact/evidence ID | Must | US-022 | 8 |
| US-024 | Applicant ranking/query | Chỉ Application; Top-K + pending/degraded/insufficient flags | Must | US-022 | 8 |
| US-025 | Hybrid/ablation experiment | BL comparison + nDCG/MRR/Recall artifacts | Must | US-010,018..024 | 13 |
| US-026 | Validated LLM wording | Redacted fact-only prompt + fallback template | Should | US-023 | 8 |

### EP-05 — Candidate workflow

| ID | User story/Deliverable | Acceptance criteria rút gọn | Pri | Dep | SP |
|---|---|---|---:|---|---:|
| US-027 | Candidate auth/profile | RBAC API; protected fields excluded | Must | Architecture DEC | 8 |
| US-028 | CV upload/status UI/API | Idempotent upload; progress/failure action | Must | US-011, Async core | 8 |
| US-029 | ParsedCV review UI | Evidence side-by-side; confirm/revision | Must | US-016 | 8 |
| US-030 | Job browse/Application result UI | Browse không personalized; own result có component/evidence/limitation sau apply | Must | US-023,024 | 8 |
| US-031 | Apply/track application | AI down vẫn apply; unique Candidate–Job toàn vòng đời; withdraw terminal + history/reason | Must | Core Job/Application | 8 |

### EP-06 — Recruiter workflow

| ID | User story/Deliverable | Acceptance criteria rút gọn | Pri | Dep | SP |
|---|---|---|---:|---|---:|
| US-032 | Company/Recruiter ownership | Cross-company access bị chặn/test | Must | US-027 | 8 |
| US-033 | Job draft/version/parse | Create/edit raw/form; version/task | Must | US-013,032 | 8 |
| US-034 | ParsedJD confirm/publish | Required/preferred confirmed; publish guard | Must | US-016,033 | 8 |
| US-035 | Applicant ranking/detail | Pending applicant không bị ẩn; batch result query | Must | US-024,031,034 | 8 |
| US-036 | Application status history | State machine 5 trạng thái; terminal/reverse transition bị chặn; optimistic lock và audit | Must | US-031,035 | 5 |

### EP-07 — Admin taxonomy

| ID | User story/Deliverable | Acceptance criteria rút gọn | Pri | Dep | SP |
|---|---|---|---:|---|---:|
| US-037 | PendingSkill review queue | Sort occurrence/risk; redacted evidence/candidates | Must | US-015 | 8 |
| US-038 | Approve/edit/merge/reject | Validation/audit/version; concurrent review safe | Must | US-037 | 8 |
| US-039 | Impact/reprocessing plan | Result cũ giữ; batch version/idempotency | Should | US-022,038 | 8 |
| US-040 | LLM skill proposal adapter | Schema, redaction, timeout/cost/fallback | Should | US-037 | 8 |

### EP-08 — Async, resilience và observability

| ID | User story/Deliverable | Acceptance criteria rút gọn | Pri | Dep | SP |
|---|---|---|---:|---|---:|
| US-041 | Outbox + RabbitMQ event contracts | Không mất event sau transaction; payload no PII | Must | Core schema | 13 |
| US-042 | Idempotent worker + retry/DLQ | Duplicate/fault tests đạt BR-043..045 | Must | US-041 | 8 |
| US-043 | Correlation/log/metrics | Trace request→task→result; log no raw CV | Must | US-041 | 5 |
| US-044 | Docker Compose reproducible | Fresh setup/migration/seed/health chạy được | Must | Service skeleton | 8 |
| US-045 | Multi-worker/load test | 1 vs 2 worker, duplicate=0, throughput report | Should | US-042,044 | 8 |

### EP-09 — Evaluation và bảo vệ

| ID | User story/Deliverable | Acceptance criteria rút gọn | Pri | Dep | SP |
|---|---|---|---:|---|---:|
| US-046 | Final annotation/adjudication | Agreement report; frozen dataset version | Must | US-007..009 | 13 |
| US-047 | Final parsing/matching experiments | All baselines same split; CI/error analysis | Must | US-017,025,046 | 13 |
| US-048 | Explanation/taxonomy evaluation | Blind rubric/gold set/results | Must | US-023,037,046 | 8 |
| US-049 | Performance/resilience report | NFR workload/config/artifacts | Must | US-042..045 | 8 |
| US-050 | Thesis/demo package | Report, diagrams, test report, demo data/video backup | Must | US-047..049 | 13 |

## 4. MVP cut-line

### Bắt buộc trước bảo vệ

- US-001 đến US-025, trừ US-026.
- US-027 đến US-038, trừ US-039/040 nếu thiếu thời gian.
- US-041 đến US-044.
- US-046 đến US-050.

### Cắt đầu tiên khi chậm

1. LLM wording (US-026).
2. LLM skill proposal (US-040); giữ local candidates + Admin.
3. Auto bulk reprocess UI (US-039); giữ manual script/task có audit.
4. Multi-worker scale demo nâng cao (US-045); vẫn test idempotency 2 worker nhỏ.
5. Company Admin riêng, notification, dashboard đẹp — không nằm backlog Must.

Không cắt dataset, baseline, explanation evidence hoặc error analysis để dành thời gian làm UI.

## 5. Roadmap 26 tuần [ĐỀ XUẤT]

| Tuần | Milestone | Deliverable |
|---|---|---|
| 1–2 | M1 Scope freeze | Title/RQ/scope/architecture DEC |
| 3–5 | M2 Data contracts | Schemas, taxonomy seed, smoke data |
| 6–8 | M3 Annotation/baselines | Pilot guideline/split, lexical/rule baseline |
| 9–12 | M4 Parsing/normalization | CV/JD parser, confirm, parsing metrics |
| 13–16 | M5 Matching core | Embedding, components, hybrid, evidence template |
| 17–20 | M6 Product integration | Candidate/Recruiter/Admin core, RabbitMQ/outbox |
| 21–23 | M7 Final evaluation | Frozen data, experiments, performance/fault tests |
| 24–26 | M8 Thesis/defense | Error analysis, report, slides, demo rehearsal |

Nếu thời gian thực tế khác, giữ thứ tự phụ thuộc và điều chỉnh scope bằng cut-line, không đảo sang UI-first.

## 6. Definition of Done cho story

- Requirement/UC/BR liên quan được cập nhật.
- Acceptance test chạy và lưu kết quả.
- Input/output/error/idempotency/security đã kiểm tra.
- Dữ liệu/version/provenance đủ nếu là AI/research story.
- Không log/commit PII/secret.
- OpenAPI/event/schema docs cập nhật.
- Traceability matrix cập nhật.
