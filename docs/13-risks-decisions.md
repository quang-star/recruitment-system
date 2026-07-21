# Risk Register, Decision Log và Open Questions

| Thuộc tính | Giá trị |
|---|---|
| Mã tài liệu | DOC-RISK-001 |
| Phiên bản | 0.2.0 |
| Trạng thái | Active |

## 1. Risk register

Thang: Probability/Impact `L`, `M`, `H`. Owner mặc định là tác giả đồ án nếu chưa ghi khác.

| Mã | Rủi ro | P | I | Dấu hiệu kích hoạt | Giảm thiểu/ứng phó |
|---|---|---:|---:|---|---|
| RSK-01 | Scope thành full job portal, nghiên cứu bị loãng | H | H | UI/CRUD tăng nhưng chưa có baseline | Freeze Must/cut-line; research-first backlog |
| RSK-02 | Không đủ CV/JD hợp lệ | H | H | Sau pilot < minimum coverage | Consent/synthetic có nhãn; giảm job family, không giảm rigor |
| RSK-03 | Annotation không nhất quán | H | H | Kappa thấp, nhiều unsure | Pilot, rubric component, adjudication, sửa guideline |
| RSK-04 | Leakage/trùng template làm metric ảo | M | H | Similar docs ở nhiều split | Hash/group split/dedup; freeze test |
| RSK-05 | Parsing CV Việt/mixed kém | H | H | Field F1 critical thấp | Human confirmation; error slices; focus text PDF |
| RSK-06 | Taxonomy trùng/sai/cycle | M | H | Nhiều merge/reject hoặc mapping conflict | Stable IDs, review, version, cycle validation, rollback version |
| RSK-07 | LLM hallucinate thuật ngữ/giải thích | H | H | Invalid facts/schema | Structured proposal, fact allow-list, validator, template/local fallback |
| RSK-08 | Gửi PII ra external LLM | M | H | Prompt/log chứa contact/raw CV | Redaction/minimal context/outbound audit; disable LLM nếu chưa an toàn |
| RSK-09 | Score bị hiểu là quyết định tuyển dụng | H | H | Recruiter/user dùng cutoff auto reject | Disclaimer, no status automation, component/evidence/quality flags |
| RSK-10 | Bias theo ngôn ngữ/job family | M | H | Slice metric chênh lớn | Slice evaluation; limitation; data balancing; protected feature exclusion |
| RSK-11 | Hybrid không hơn baseline | M | H | Validation/test delta nhỏ/âm | Báo trung thực; ablation/error analysis; đóng góp có thể là explainability/workflow |
| RSK-12 | Microservices làm chậm tiến độ | H | H | Nhiều tuần cho Gateway/Eureka/DB ops | Core+AI tối thiểu; Auth decision; Docker DNS; bỏ hạ tầng không cần |
| RSK-13 | Queue duplicate/mất task | M | H | Result trùng, state treo | Outbox, idempotency, retry hữu hạn, reconciliation/DLQ |
| RSK-14 | Reprocess phá audit hoặc quá tải | M | H | Result cũ biến mất, queue age tăng | Immutable result, version, batch checkpoint/rate limit |
| RSK-15 | External API cost/rate limit/network | M | M | Budget/latency vượt | Cache theo version, call minimal, budget, local/template fallback |
| RSK-16 | Demo fail do tài nguyên máy | M | H | Compose OOM/khởi động lâu | Một PostgreSQL, image gọn, seed nhỏ, rehearsal/video backup |
| RSK-17 | NFR target không thực tế | M | M | Pilot vượt target nhiều | Ghi environment; DEC điều chỉnh có lý do, không sửa số sau test |
| RSK-18 | Claim “toàn CNTT” vượt dữ liệu | H | H | Hội đồng hỏi vị trí chưa test | Tách Accepted/Supported/Evaluated; limitation UI/report |
| RSK-19 | Dữ liệu/version không tái lập | M | H | Không biết config/code tạo result | Experiment record, artifact hash, immutable versions |
| RSK-20 | Thời gian còn lại không đủ | H | H | Milestone trễ >2 tuần | Cắt Should/LLM/UX trước; không cắt evaluation core |

## 2. Decision log

| Mã | Trạng thái | Quyết định/Đề xuất | Lý do |
|---|---|---|---|
| DEC-001 | [ĐÃ CHỐT] | Working baseline dùng tên “Thiết kế và đánh giá hệ thống hỗ trợ phân tích CV và xác định mức độ phù hợp với vị trí tuyển dụng trong lĩnh vực Công nghệ thông tin bằng AI”; nếu trường yêu cầu rút gọn, dùng “Hệ thống hỗ trợ tuyển dụng CNTT tích hợp AI cho phân tích CV và matching công việc”; đổi tên không mở rộng MVP | Thể hiện đúng phạm vi hiện tại, giữ vai trò hỗ trợ và không khóa phương pháp vào một kỹ thuật AI cụ thể |
| DEC-002 | [ĐÃ CHỐT] | Phạm vi lĩnh vực là CNTT, không phải tất cả ngành nghề | Taxonomy/dữ liệu/rubric có tính miền |
| DEC-003 | [ĐÃ CHỐT] | Tách Accepted/Supported/Evaluated | Cho taxonomy mở nhưng không claim vượt benchmark |
| DEC-004 | [ĐÃ CHỐT] | Human-in-the-loop; không auto-reject | An toàn, minh bạch, đúng “hỗ trợ” |
| DEC-005 | [ĐÃ CHỐT] | Hybrid rule + semantic tính điểm; LLM không quyết định score | Kiểm chứng/tái lập/fallback được |
| DEC-006 | [ĐÃ CHỐT] | Tách Auth Service riêng khỏi Recruitment Core Service | Auth sở hữu credential/token/role; Core sở hữu profile/Company/ownership nghiệp vụ |
| DEC-007 | [ĐÃ CHỐT] | MVP dùng một PostgreSQL server vật lý với DB/schema, credential, migration và ownership riêng cho Auth/Core/AI; cấm cross-schema/table access và cross-service join | Giảm RAM/ops nhưng giữ đúng data ownership và scale path |
| DEC-008 | [ĐÃ CHỐT] | MinIO private là storage chính; local private volume là fallback sau cùng interface lưu trữ | Không để storage làm chậm research và giữ khả năng thay thế |
| DEC-009 | [ĐÃ CHỐT] | External LLM là Should, không phải Must; output non-authoritative, không tính điểm/tạo evidence/đổi application status; chỉ rewrite fact đã validate, đề xuất taxonomy cần người duyệt hoặc proposal cho field parser không chắc chắn vẫn cần user confirmation; lỗi/disabled phải fallback template/local | Cost/privacy/availability; pipeline core chạy độc lập và tránh thành LLM wrapper |
| DEC-010 | [ĐÃ CHỐT] | Task dài/bulk async qua RabbitMQ; query result sync; upload không chờ parse; retry hữu hạn, backoff, DLQ và idempotency bắt buộc | UX/resilience/scale nhưng không cần workflow engine |
| DEC-011 | [ĐÃ CHỐT] | CV development dùng datasetmaster/resumes và Updated Resume Dataset; PDF parser dùng mẫu opensporks đã kiểm tra cùng CV có consent; JD dùng VietJobs; final matching ground truth do nhóm tự ghép và gán nhãn | Tách nguồn development khỏi nguồn đánh giá, ưu tiên giấy phép rõ và dữ liệu thật có consent |
| DEC-012 | [ĐÃ CHỐT] | Sản phẩm tiếp nhận toàn bộ vị trí CNTT; ưu tiên thu thập năm family Backend, Frontend, Full-stack, DevOps và Data/AI; final evaluated scope chỉ gồm family đạt độ phủ tối thiểu | Giữ khả năng mở rộng nhưng giới hạn claim theo dữ liệu thực tế |
| DEC-013 | [ĐÃ CHỐT] | Hai annotator gán độc lập pilot 50–100 cặp và toàn bộ final test cốt lõi, đo agreement trước thảo luận rồi adjudication; annotator thứ hai chọn từ người có kinh nghiệm CNTT/tuyển dụng kỹ thuật | Đo agreement và giảm chủ quan; danh tính phải chốt trước pilot |
| DEC-014 | [ĐÃ CHỐT] | Label matching ordinal 0–4; UNSURE là cờ ngoài thang, báo tỷ lệ riêng và phải review/adjudicate trước final test | Phù hợp nDCG/rubric đa tiêu chí và không biến thiếu căn cứ thành điểm |
| DEC-015 | [ĐÃ CHỐT] | MVP hỗ trợ CV PDF có text ≤10 MB và JD text/form, Việt/Anh/mixed; PDF mật khẩu/hỏng/chỉ ảnh, OCR, ảnh chụp, viết tay và layout phức tạp ngoài scope; confidence theo field, bản parser gốc tách bản user-confirmed | Giảm biến số, giữ audit và chỉ đánh giá trên loại tài liệu đã công bố hỗ trợ |
| DEC-016 | [ĐỀ XUẤT] | Weight/penalty trong AI doc chỉ là candidate v0 | Phải chọn bằng validation/ablation |
| DEC-017 | [ĐÃ CHỐT] | MatchingResult/version lịch sử immutable | Audit và reproducibility |
| DEC-018 | [ĐÃ CHỐT] | Unknown term chỉ thành taxonomy sau Admin approve/edit/merge | LLM/tự động normalization không phải ground truth |
| DEC-019 | [ĐÃ CHỐT] | Dữ liệu CV/JD do LLM sinh phải được đánh dấu synthetic và reviewer xác nhận; chỉ dùng bổ sung development/pilot/train, không thay thế hoàn toàn final test | Tránh đánh giá mô hình trên dữ liệu do chính mô hình tạo và giữ tính khoa học |
| DEC-020 | [ĐÃ CHỐT] | Dùng Spring Cloud Gateway làm public entry point; route tĩnh qua Docker Compose DNS, không dùng Eureka trong MVP | Có gateway microservice rõ ràng nhưng tránh service discovery không cần thiết |
| DEC-021 | [ĐÃ CHỐT] | Gateway dùng Java 21 LTS, Spring Boot 4.0.7, Spring Cloud BOM 2025.1.2 và Spring Cloud Gateway Server WebFlux 5.0.2 | Bộ phiên bản được Spring xác nhận tương thích; dùng BOM quản lý dependency, không pin riêng Spring Security/Reactor/Netty |
| DEC-022 | [ĐÃ CHỐT] | Hoàn thành MVP kỹ thuật trước 2026-08-31; tháng 9/2026 dành cho test/evaluation/report/deploy; phát triển/demo local trên i5-11300H, RAM 16 GB, GTX 1650 và chỉ public VPS sau khi ổn định | Tạo cut-line thực tế, ưu tiên stack nhẹ và không để VPS chặn MVP |
| DEC-023 | [ĐÃ CHỐT] | MVP gồm Web, Gateway, Auth, Core, AI API và AI Worker process/container riêng; chỉ Web/Gateway public; Docker Compose dev/prod tách override; không Eureka/Kubernetes/service mesh/HA/multi-region | Thể hiện service boundary đủ rõ trên tài nguyên 16 GB mà không over-engineer |
| DEC-024 | [ĐÃ CHỐT] | Không personalized recommendation trước apply; chỉ matching/ranking Candidate đã chủ động apply; một Application duy nhất cho Candidate–Job và không re-apply; trạng thái SUBMITTED, UNDER_REVIEW, SHORTLISTED, REJECTED, WITHDRAWN; hai trạng thái cuối terminal; không sourcing/interview/offer/onboarding | Giữ phạm vi sàng lọc ban đầu và AI chỉ hỗ trợ Recruiter |

## 3. Open questions ưu tiên

| Ưu tiên | Câu hỏi | Khuyến nghị | Deadline/Ảnh hưởng |
|---:|---|---|---|
| 1 | Tên working baseline đã được GVHD/trường phê duyệt chính thức chưa? | Gửi DEC-001 và mô tả scope; chỉ đổi tên nếu có yêu cầu chính thức, không mở rộng MVP | Trước M1; ảnh hưởng bìa/báo cáo |
| 2 | Đã kiểm tra provenance/PII và ghi dataset registry cho từng nguồn chưa? | Kiểm tra từng file/record trước khi sử dụng; không suy ra an toàn chỉ từ license tổng | Trước pilot dataset |
| 3 | Family nào trong năm nhóm ưu tiên đạt độ phủ tối thiểu cho final test? | Thu thập cả năm; dùng coverage pilot để freeze evaluated scope | Sau pilot, trước test freeze |
| 4 | Ai là annotator thứ hai và adjudicator? | Ưu tiên recruiter IT/tech lead/mentor; training cùng rubric trước pilot | Trước annotation pilot |
| 5 | Retention raw CV/application là bao lâu? | Chốt trước dữ liệu thật/public VPS; demo có cleanup policy | Privacy/NFR |
| 6 | External LLM provider nào được phép dùng? | Chỉ quyết định khi làm adapter Should; minimal redacted facts và outbound audit | Không chặn core MVP |
| 7 | Gateway stack đã khóa có cần nâng phiên bản giữa đồ án không? | Không tự nâng; chỉ nâng vì CVE nghiêm trọng/lỗi blocking và chạy regression | Theo dõi trong phát triển |

## 3.1 Baseline freeze ngày 2026-07-20

| Mục đã chốt | Quyết định liên quan |
|---:|---|
| 1 — Thời hạn và máy demo | DEC-022 |
| 2 — External LLM | DEC-005, DEC-009, DEC-018 |
| 3 — Hạ tầng MVP | DEC-006..010, DEC-020, DEC-021, DEC-023 |
| 4 — Đầu vào và parsing | DEC-015 |
| 5 — Workflow tuyển dụng | DEC-004, DEC-024 |
| 6 — Tên đề tài | DEC-001 |
| 7 — Annotation | DEC-013, DEC-014 |

## 4. Những xung đột phải quyết định bằng evidence

| Xung đột | Không nên quyết theo cảm tính | Evidence cần |
|---|---|---|
| 3 vs 5 job families | “Càng nhiều càng tốt” | Sample/label coverage và per-slice CI |
| Rule vs semantic weight | Chọn số đẹp | Validation + ablation |
| Penalty critical skill | Hard cutoff | Ranking/error cases + stakeholder review |
| LLM proposal | Demo ấn tượng | Accuracy/cost/privacy/review-time EXP |
| Tách Auth service | “Microservice scale hơn” | Timeline, failure modes, deployment/ownership need |
| pgvector index | Chọn công nghệ theo trend | Dataset size, EXPLAIN, latency/recall benchmark |

## 5. Câu hỏi hội đồng và hướng trả lời

### 5.1 Điểm mới là gì khi hệ thống matching đã phổ biến?

Điểm đóng góp không phải chỉ “có AI”, mà là phương pháp hybrid đa tiêu chí có hard-rule/semantic component, result versioned, explanation trỏ evidence và taxonomy mở có human confirmation; các phần được so với baseline và đánh giá riêng.

### 5.2 Vì sao không chỉ gửi CV và JD cho LLM?

LLM-only khó tái lập, khó kiểm soát hard constraint, có privacy/cost/availability và hallucination. Pipeline vẫn chạy khi không có LLM; LLM chỉ đề xuất/diễn đạt và output bị validate.

### 5.3 Hỗ trợ toàn CNTT nhưng chỉ test vài vị trí có mâu thuẫn không?

Không nếu phân biệt khả năng tiếp nhận với phạm vi đã kiểm chứng. Sản phẩm dùng taxonomy mở; kết luận khoa học chỉ áp dụng cho job family/language có dữ liệu và metric.

### 5.4 Admin xác nhận skill có chứng minh AI đúng không?

Không. Admin confirm là control nghiệp vụ. Độ đúng được đo trên unknown-term gold set/annotation độc lập; acceptance rate chỉ là metric vận hành bổ sung.

### 5.5 Score có công bằng không?

Hệ thống loại protected attributes, lưu component/evidence và không auto-reject. Tuy vậy không thể tuyên bố “không bias” tuyệt đối; phải báo slice metrics, data limitation và human oversight.

### 5.6 Vì sao dùng microservices?

AI task có runtime/dependency/scale/failure khác Core và cần queue/worker độc lập. Auth Service và Spring Cloud Gateway đã được chốt để thể hiện ranh giới microservices; không thêm Eureka/Kubernetes/service mesh trong MVP vì Docker Compose DNS đã đủ.

### 5.7 Vì sao chọn trọng số?

Weight v0 là giả thuyết nghiệp vụ. Candidate sets được chọn trên validation và ablation; test set chỉ đánh giá cuối, version/config được lưu.

### 5.8 Ground truth “phù hợp” có chủ quan không?

Có tính chủ quan nên dùng rubric component, label ordinal, ≥2 annotator trên subset, đo agreement và adjudication. Báo cả disagreement/limitation.

### 5.9 Explanation có phải LLM bịa không?

Explanation gốc được sinh từ fact/component/evidence. Nếu LLM rewrite, nó chỉ nhận allow-listed facts và output qua validator; fail thì dùng template.

### 5.10 Nếu hybrid không hơn baseline thì sao?

Không sửa claim. Báo kết quả, error/ablation, xác định trường hợp rule/semantic có lợi. Đóng góp vẫn có thể nằm ở evidence explainability, taxonomy workflow và phân tích giới hạn, nhưng không tuyên bố superiority.

### 5.11 Scale được chứng minh thế nào?

Không claim production scale. Chứng minh worker stateless/idempotent, tăng replica, queue backpressure, data ownership và benchmark tại workload/môi trường ghi rõ.

### 5.12 Tại sao semantic similarity không đủ?

Nó có thể cho điểm cao với nội dung gần nhưng thiếu kỹ năng bắt buộc/số năm/cấp độ. Rule xử lý constraint; semantic xử lý ngữ nghĩa/đồng nghĩa; hybrid cần thực nghiệm để chứng minh.

## 6. Quy tắc quản lý risk/decision

- Review Risk Register mỗi milestone; cập nhật P/I/trigger/action.
- Mọi [CẦN XÁC NHẬN] có ảnh hưởng Must phải chốt trước story phụ thuộc.
- Khi đổi [ĐÃ CHỐT], tạo Decision Record và cập nhật RTM trong cùng commit.
- Risk xảy ra không được xóa; chuyển trạng thái, ghi incident/response/lesson.




