# Khung báo cáo, slide và demo bảo vệ

| Thuộc tính | Giá trị |
|---|---|
| Mã tài liệu | DOC-THESIS-001 |
| Phiên bản | 0.2.0 |
| Trạng thái | Working baseline |

## 1. Luận điểm trung tâm

Đồ án không chỉ xây một website gọi LLM. Luận điểm cần chứng minh là:

> Có thể xây dựng một hệ thống hỗ trợ tuyển dụng CNTT trong đó CV/JD được trích xuất và chuẩn hóa thành dữ liệu có cấu trúc; mức phù hợp được tính bằng phương pháp hybrid đa tiêu chí có version; kết quả được giải thích bằng evidence; LLM chỉ là thành phần hỗ trợ tùy chọn và quyết định tuyển dụng vẫn thuộc về con người.

## 2. Cấu trúc báo cáo đề xuất

### Chương 1 — Tổng quan đề tài

Nguồn: `01-vision-and-scope.md`, `02-stakeholders-and-context.md`, `13-risks-decisions.md`.

- Bối cảnh và problem statement.
- Mục tiêu nghiệp vụ/nghiên cứu.
- Câu hỏi nghiên cứu.
- Đối tượng/phạm vi/giới hạn.
- Đóng góp dự kiến và cấu trúc báo cáo.

### Chương 2 — Cơ sở lý thuyết và công trình liên quan

- CV/JD information extraction.
- Skill/entity normalization và taxonomy.
- Lexical retrieval: TF-IDF/BM25.
- Multilingual embeddings/semantic retrieval.
- Person–job fit/multi-criteria/hybrid ranking.
- Explainable applicant matching/evidence grounding.
- Human-in-the-loop, privacy/fairness trong tuyển dụng.
- Khoảng trống mà đề tài giải quyết.

Mọi paper/model cụ thể phải có nguồn chính thống và trích dẫn; không dùng claim từ tài liệu thiết kế thay cho related work.

### Chương 3 — Phân tích và thiết kế hệ thống

Nguồn: `02` đến `09`.

- Stakeholder/actor/system context.
- Business processes/rules/use cases.
- FR/NFR.
- Data model/versioning/evidence.
- Kiến trúc Core–AI–queue và failure handling.
- Security/privacy/LLM boundary.

### Chương 4 — Phương pháp đề xuất

Nguồn: `07-data-design.md`, `08-ai-matching-design.md`.

- ParsedCV/ParsedJD schema.
- Parsing/confidence/human confirmation.
- Taxonomy/alias/unknown-term workflow.
- Rule/semantic components.
- Công thức aggregation/penalty và version.
- Evidence/explanation/LLM validator/fallback.
- Complexity và failure modes.

Phân biệt rõ phần **đề xuất** với giá trị đã **được chọn sau validation**.

### Chương 5 — Thực nghiệm và kết quả

Nguồn: `10-evaluation-plan.md`, Experiment Records và artifacts.

- Dataset, quyền sử dụng, anonymization.
- Annotation rubric/agreement/split.
- Baselines, protocol, môi trường.
- Parsing/normalization results.
- Matching/ranking/ablation results.
- Explanation/taxonomy results.
- Performance/resilience results.
- Error analysis và threat to validity.

Không chỉ trình bày screenshot; bảng metric phải gắn version/artifact.

### Chương 6 — Kết luận và hướng phát triển

- Trả lời từng RQ.
- Đóng góp thực tế/nghiên cứu.
- Điều không được chứng minh.
- Limitation theo dữ liệu/language/job family/architecture.
- Hướng mở rộng có điều kiện.

## 3. Ánh xạ RQ vào báo cáo

| RQ | Chương phương pháp | Chương kết quả | Kết luận phải có |
|---|---|---|---|
| RQ-01 | Parsing/normalization | Field/entity metrics/error | Schema/pipeline đủ đến mức nào |
| RQ-02 | Hybrid design | Baseline ranking comparison | Có/không cải thiện, phạm vi nào |
| RQ-03 | Component/penalty | Ablation/slices | Thành phần nào có ích/gây lỗi |
| RQ-04 | Evidence explanation | Human/automatic explanation evaluation | Độ faithful/limitation |
| RQ-05 | PendingSkill/LLM/Admin | Unknown-term gold set/review time | LLM hỗ trợ đến mức nào |
| RQ-06 | Async/scale design | Performance/fault tests | Quy mô đã chứng minh, không claim production |

## 4. Deliverable map

| Deliverable | Nguồn sự thật | Bằng chứng hoàn thành |
|---|---|---|
| Proposal/Vision | Docs 01–02 | Scope/RQ được GVHD chốt |
| BA/SRS | Docs 03–06 | BR/UC/FR/NFR/RTM consistent |
| ERD/Data dictionary | Doc 07 | Schema/migration/fixtures |
| AI methodology | Doc 08 | Algorithm config/tests/experiments |
| Architecture | Doc 09 | Compose/event contracts/fault tests |
| Evaluation | Doc 10 + EXP records | Frozen dataset/predictions/metrics |
| Backlog/plan | Doc 11 | Milestone/cut-line cập nhật |
| Test report | Doc 14 + test artifacts | Critical E2E/security/performance pass |
| Thesis/slide/demo | Doc 15 | Rehearsal và claim checklist |

## 5. Slide bảo vệ đề xuất — tối đa khoảng 18–20 slide

1. Tên đề tài và một câu problem.
2. Bối cảnh/pain point.
3. Mục tiêu và RQ.
4. Phạm vi: toàn CNTT vs evaluated groups.
5. Related work/gap.
6. System context và actors.
7. End-to-end flow.
8. ParsedCV/ParsedJD + taxonomy.
9. Unknown skill: LLM propose/Admin confirm.
10. Hybrid components.
11. Formula/penalty/human decision.
12. Evidence-based explanation.
13. Kiến trúc và async/fallback.
14. Dataset/annotation/baselines.
15. Parsing/normalization results.
16. Matching/ablation results.
17. Explanation/performance results.
18. Demo.
19. Limitations/threats.
20. Kết luận/hướng phát triển.

Không dành quá nhiều slide cho JWT, CRUD, Docker hoặc screenshot UI.

## 6. Demo script 7–10 phút

1. Recruiter tạo JD có một alias và một công nghệ chưa biết.
2. Hệ thống parse; Recruiter xác nhận required/preferred.
3. Candidate upload CV; xem confidence/evidence và sửa/xác nhận.
4. Admin xem PendingSkill, merge/approve và taxonomy version.
5. Candidate duyệt Job Published, ứng tuyển và xem breakdown/evidence của Application thuộc chính mình sau khi matching hoàn tất.
6. Candidate apply.
7. Recruiter thấy Candidate dù score pending/thấp; xem ranking/evidence và cập nhật status thủ công.
8. Tắt/disable LLM hoặc dùng fallback để chứng minh core vẫn hoạt động.
9. Mở nhanh bảng experiment metric/version, không chỉ UI.

Chuẩn bị seed deterministic, checklist khởi động và video backup.

## 7. Claim checklist trước nộp

- [ ] Không gọi hệ thống là tự động tuyển dụng/auto-reject.
- [ ] Không nói “hỗ trợ toàn CNTT chính xác” khi chỉ test vài family.
- [ ] Không gọi Admin acceptance là ground-truth accuracy.
- [ ] Không nói LLM tính score nếu hybrid engine tính score.
- [ ] Không nói cosine là final fit.
- [ ] Mọi con số có dataset/config/environment/version.
- [ ] Baseline dùng cùng split/input.
- [ ] Test không được dùng để tune.
- [ ] Explanation có evidence và limitation.
- [ ] Privacy/PII/consent được mô tả.
- [ ] Kết luận trả lời từng RQ và ghi negative result nếu có.

## 8. Nhịp cập nhật xuyên suốt đồ án

| Hàng tuần | Mỗi milestone | Trước báo cáo/bảo vệ |
|---|---|---|
| Cập nhật backlog/risk/decision | Freeze version/RTM/experiment record | Đối chiếu claim checklist |
| Ghi test/experiment artifact | Review scope/cut-line | Fresh setup + E2E/fault rehearsal |
| Không để rule chỉ nằm trong code | Review data/privacy/limitation | Chốt số liệu, không chạy chọn kết quả đẹp |
