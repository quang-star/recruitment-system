# Evaluation Plan

| Thuộc tính | Giá trị |
|---|---|
| Mã tài liệu | DOC-EVAL-001 |
| Phiên bản | 0.2.0 |
| Trạng thái | Proposed protocol — freeze sau pilot |

## 1. Mục tiêu

Chứng minh bằng dữ liệu rằng pipeline thực hiện được bốn việc riêng biệt:

1. Trích xuất/chuẩn hóa CV và JD.
2. Xếp hạng mức phù hợp CV–JD tốt hơn hoặc ổn định hơn baseline.
3. Giải thích đúng với score/evidence, không tạo claim thiếu căn cứ.
4. Chạy với latency, retry và khả năng scale phù hợp môi trường đồ án.

Admin approve taxonomy chứng minh workflow sản phẩm, không thay thế ground truth khoa học.

## 2. Claim–metric matrix

| Claim | RQ | Metric chính | Điều kiện kết luận |
|---|---|---|---|
| Parsing đủ dùng cho matching | RQ-01 | Entity Precision/Recall/F1 theo field/language | Có ground truth và error analysis |
| Hybrid ranking tốt hơn baseline | RQ-02 | nDCG@5, MRR, Recall@10 | So cùng split; báo CI/significance phù hợp |
| Component/penalty có ích | RQ-03 | Ablation delta và error slices | Không chọn weight trên test |
| Explanation có căn cứ | RQ-04 | Evidence precision, unsupported-claim rate, human rubric | Claim trỏ evidence/fact; đánh giá blind |
| LLM giúp review taxonomy | RQ-05 | Top-k suggestion accuracy, action acceptance/merge/reject, review time | So local-only và local+LLM trên unknown-term set |
| Kiến trúc đáp ứng demo/scale | RQ-06 | p95 latency, throughput, failure recovery, duplicate rate | Ghi cấu hình máy và workload |

## 3. Phạm vi dữ liệu

### 3.1 Job family

**[ĐỀ XUẤT]** Thu thập trên năm nhóm:

- Backend.
- Frontend.
- Full-stack.
- DevOps.
- Data/AI.

Sau pilot, chỉ giữ nhóm có số mẫu tối thiểu đủ báo cáo. Hệ thống vẫn tiếp nhận các vị trí CNTT khác nhưng đánh dấu ngoài phạm vi evaluated.

### 3.2 Quy mô theo giai đoạn

| Giai đoạn | CV | JD | Cặp CV–JD có label | Mục đích |
|---|---:|---:|---:|---|
| Smoke | 5–10 | 5–10 | 20–40 | Kiểm schema/pipeline |
| Pilot | 20–30 | 20–30 | 150–250 | Sửa guideline, chọn ngưỡng/weight candidate |
| Final khuyến nghị | 80–120 | 60–100 | 800–1,200 | So baseline/ranking/error slices |
| Minimum fallback | 50 | 40 | ≥400 | Báo limitation rõ, giảm số slice |

Đây là target khả thi, không phải cam kết trước khi biết nguồn dữ liệu và thời gian. Chất lượng/độ phủ quan trọng hơn số file thô.

## 4. Nguồn dữ liệu và pháp lý

Nguồn ưu tiên:

1. CV tự nguyện và có consent nghiên cứu, đã ẩn danh.
2. CV/JD tổng hợp, kể cả dữ liệu do LLM sinh, phải dựa trên template/profile giả, được reviewer xác nhận và đánh dấu `source_type = SYNTHETIC_LLM` hoặc loại synthetic tương ứng.
3. JD công khai được lưu theo quyền trích dẫn/sử dụng hoặc JD do nhóm tự tạo/rewrite.
4. Không crawl hàng loạt hoặc dùng CV thật không có quyền.

Dữ liệu do LLM sinh chỉ bổ sung cho development, pilot hoặc train. Final test chính phải ưu tiên dữ liệu thật đã ẩn danh hoặc dữ liệu do con người biên soạn/gán nhãn độc lập; nếu có synthetic test slice phải báo riêng và không dùng để thay thế toàn bộ real-world test.

Nguồn baseline đã chốt:

- CV có cấu trúc cho development: `datasetmaster/resumes` (MIT).
- CV text CNTT bổ sung: `jillanisofttech/updated-resume-dataset` (CC0).
- PDF parser fixtures: lấy mẫu có kiểm tra từ `opensporks/resumes` (CC0) và CV thật có consent.
- JD tiếng Việt: `VinNLP/VietJobs` (MIT), lọc nhóm CNTT.
- Ground truth matching: tự ghép cặp và gán nhãn độc lập; không dùng điểm tự sinh từ dataset công khai làm nhãn cuối.

Mỗi item lưu:

- Source category và quyền/license/consent reference.
- Language/job family.
- Synthetic/real flag.
- Anonymization status và reviewer.
- Hash để chống trùng.
- Dataset version/split/group key.

## 5. Ẩn danh

Loại/biến đổi trước annotation/export:

- Name → pseudonymous ID.
- Email/phone/address/social URL/photo/DOB/gender/marital/religion/ethnicity → remove.
- Company/school có thể pseudonymize nếu không cần cho task.
- Free text được scan lại để phát hiện PII sót.
- Raw mapping key lưu tách biệt hoặc không lưu nếu không cần.

Tạo checklist và lấy mẫu review thủ công; “đã regex” không đủ để tuyên bố ẩn danh hoàn toàn.

## 6. Ground truth parsing

### 6.1 Đơn vị annotation

- Field/document: language, title/level, min experience.
- Span/entity: raw skill, canonical skill, dates, responsibility, education, certificate, language.
- Relation: skill thuộc experience/project nào; required hay preferred; evidence span.

### 6.2 Quy trình

1. Freeze schema/guideline version và training annotator bằng cùng rubric.
2. Hai annotator gán độc lập pilot 50–100 cặp, không xem score hệ thống hoặc nhãn của nhau.
3. Đo agreement trước thảo luận, sửa rubric và pilot lại nếu cần.
4. Hai annotator gán độc lập toàn bộ final test cốt lõi.
5. Adjudicator xử lý bất đồng và cập nhật guideline bằng ví dụ biên.
6. Test set chỉ sửa label khi phát hiện lỗi annotation có log/version.

### 6.3 Metric

- Exact/normalized match cho field categorical.
- Span exact và relaxed overlap cho entity.
- Micro và macro Precision/Recall/F1.
- Field-level accuracy cho required/preferred/level.
- Báo riêng `vi`, `en`, `mixed` và job family nếu đủ mẫu.

## 7. Ground truth matching

### 7.1 Thang label 0–4

| Label | Định nghĩa |
|---:|---|
| 0 | Không phù hợp: thiếu phần lớn yêu cầu cốt lõi hoặc khác job family rõ rệt |
| 1 | Phù hợp thấp: có rất ít điểm liên quan, thiếu nhiều required/experience |
| 2 | Phù hợp một phần: đáp ứng một số yêu cầu nhưng còn khoảng thiếu quan trọng |
| 3 | Phù hợp: đáp ứng phần lớn required và kinh nghiệm/ngữ cảnh tương đối phù hợp |
| 4 | Rất phù hợp: đáp ứng hầu hết yêu cầu cốt lõi, có evidence mạnh, ít khoảng thiếu |

Cho phép UNSURE/INSUFFICIENT_INFORMATION nhưng đây là cờ ngoài thang ordinal 0–4, không phải một mức điểm. Chỉ tính weighted Cohen's kappa trên cặp mà cả hai annotator chọn 0–4; báo riêng tỷ lệ UNSURE. Mẫu có ít nhất một UNSURE phải review/adjudicate trước khi vào final test.

### 7.2 Rubric bắt buộc

Annotator ghi riêng:

- Required skill coverage.
- Preferred skill coverage.
- Relevant experience.
- Title/level.
- Responsibility/domain similarity.
- Education/language nếu applicable.
- Critical missing requirement.
- Overall label và confidence.

Annotator không được xem score/ranking của hệ thống khi gán ground truth.

### 7.3 Lấy cặp

Để tránh toàn cặp dễ:

- Positive/hard positive trong cùng job family.
- Hard negative cùng family nhưng thiếu required/level.
- Cross-family negative.
- Bilingual/cross-language pairs.
- Các cặp có alias/unknown/transferable skill.

## 8. Agreement và adjudication

- Categorical/ordinal: weighted Cohen's kappa trên các cặp 0–4 của hai annotator; Krippendorff's alpha nếu >2/missing.
- Span/entity: pairwise F1/overlap.
- Report raw agreement, disagreement distribution và UNSURE rate, không chỉ một hệ số.
- **[ĐỀ XUẤT]** mục tiêu weighted kappa ≥0.70 cho overall relevance; nếu thấp, sửa rubric/pilot lại.
- Adjudicator không đơn giản lấy trung bình; ghi quyết định và reason.

Annotator thứ hai chưa định danh tại thời điểm freeze; ưu tiên recruiter IT, tech lead, mentor/senior từng đọc CV hoặc người có năng lực tương đương. Danh tính annotator thứ hai và adjudicator phải được xác định trước pilot.

## 9. Chia tập và chống leakage

### Split đề xuất

- Development/pilot: 20%.
- Validation: 20%.
- Test: 60% nếu dataset nhỏ và không train model; hoặc 60/20/20 nếu có bước học/tune rõ.

Nguyên tắc quan trọng hơn tỷ lệ:

- Cùng CV version/template/candidate group không xuất hiện ở nhiều split.
- Các JD version gần như trùng phải cùng group.
- Alias/taxonomy base được freeze trước test; term test mới phải xử lý theo policy, không bổ sung thủ công sau khi nhìn label.
- Weight/threshold chọn trên validation, test chỉ chạy cuối.
- Synthetic variants từ cùng template phải cùng split.

## 10. Baseline

| Mã | Baseline | Mục đích |
|---|---|---|
| BL-01 | Rule-only exact/alias + experience | Đo giá trị luật/taxonomy |
| BL-02 | TF-IDF cosine | Lexical baseline tái lập, nhẹ |
| BL-03 | BM25 | Retrieval lexical theo Job query |
| BL-04 | Embedding-only | Đo semantic representation đơn lẻ |
| BL-05 | Hybrid proposed | Phương pháp chính |
| BL-06 | LLM-only optional trên subset | Minh họa cost/variance/black-box, không phải core |

Tất cả baseline dùng cùng documents, split, candidate pool và relevance label. Không cho baseline ít thông tin hơn vô lý.

## 11. Experiments

| Mã | Input | Variants | Metric |
|---|---|---|---|
| EXP-PAR-01 | Parsing test | rule/dictionary; combined parser | Field/entity P/R/F1 |
| EXP-NOR-01 | Term set | exact/alias; +fuzzy; +semantic candidates | Top-1/Top-3 normalization accuracy |
| EXP-MAT-01 | Pair/ranking test | BL-01..BL-05 | nDCG@5/10, MRR, Recall@10 |
| EXP-MAT-02 | Validation/test | Full hybrid minus each component | Delta metric, slice errors |
| EXP-MAT-03 | Validation/test | no penalty; candidate penalties | Ranking metric + critical miss behavior |
| EXP-EVD-01 | Explanation sample | template; validated LLM wording | Evidence precision, unsupported claim, rubric |
| EXP-TAX-01 | Unknown term set | local candidate; local+LLM | Top-k accuracy, review time, invalid rate |
| EXP-PERF-01 | Fixed workload | 1/2/4 workers where possible | Throughput, p95, duplicate/error rate |
| EXP-RES-01 | Fault scenarios | dependency stop/recovery | Recovery time, lost task/result count |

## 12. Ranking metrics

- `nDCG@5` là metric chính vì label có thứ bậc và UI dùng Top-K.
- `MRR` đo vị trí item phù hợp cao đầu tiên.
- `Recall@10` đo độ phủ applicant phù hợp trong từng Job.
- `MAP`/Precision@K dùng bổ sung sau khi định nghĩa threshold relevant (ví dụ label ≥3).
- Không dùng accuracy trên toàn bộ cặp làm metric duy nhất do imbalance/ranking nature.

Unit of evaluation là Job → ranked Applications/Candidates đã apply. Cặp CV–JD ngoài Application có thể dùng trong development/pilot phương pháp, nhưng không được mô tả như chức năng personalized recommendation của MVP.

## 13. Explanation evaluation

### Rubric 1–5

| Tiêu chí | Câu hỏi |
|---|---|
| Correctness | Claim có đúng với component/input không? |
| Evidence fidelity | Evidence có trực tiếp hỗ trợ claim không? |
| Coverage | Có nêu các lý do quan trọng nhất không? |
| Understandability | Người dùng hiểu được mà không biết thuật toán không? |
| Actionability | Candidate/Recruiter biết điểm mạnh/khoảng thiếu gì không? |
| Non-hallucination | Có thêm công nghệ/số năm/kết luận không tồn tại không? |

Metric tự động:

- `% claim có factId/evidenceId` — target 100% theo contract.
- Unsupported-claim rate.
- Numeric/entity contradiction rate.
- Template/LLM fallback rate.

Human evaluation blind giữa generator variants khi khả thi.

## 14. Taxonomy proposal evaluation

Tạo gold set gồm:

- Alias của skill đã có.
- Skill thực sự mới.
- Term không phải skill.
- Ambiguous term cần context.
- Typo/format đặc biệt (`C#`, `.NET`, `Nodejs`).

Metric:

- Correct action Top-1 (`MERGE/CREATE/REJECT/UNKNOWN`).
- Correct target Top-1/Top-3 nếu merge.
- Valid JSON/schema rate.
- Admin acceptance/edit/merge/reject rate.
- Median review time.
- Cost/latency nếu dùng external LLM.

Không dùng Admin acceptance rate duy nhất làm accuracy vì reviewer cũng có thể sai.

## 15. Performance protocol

Ghi cố định:

- CPU/RAM/GPU/OS/Docker version.
- Database/RabbitMQ/worker replica/config.
- Dataset/vector count và document size distribution.
- Warm-up, duration, concurrency, percentile.
- Có/không external LLM; network latency tách riêng.

Workload:

1. Upload accept path.
2. Parse batch PDF text.
3. Single-pair matching.
4. Top-K retrieval ở 1k/10k vectors.
5. Bulk recompute với 1 và ≥2 workers.
6. Stop AI/RabbitMQ/worker và phục hồi.

## 16. Success gates [ĐỀ XUẤT]

| Nhóm | Target | Fallback trung thực |
|---|---|---|
| Parsing | Macro F1 cốt lõi ≥0.80; không field critical dưới 0.65 | Báo field/language lỗi, tăng human review |
| Ranking | Hybrid nDCG@5 cao hơn best single baseline; target relative +5% | Nếu không hơn: phân tích component/slice, không claim superiority |
| Explanation | 100% structured claim linked; unsupported claim ≤5% human set | Chỉ dùng template cho bản bảo vệ |
| Taxonomy | Top-3 candidate accuracy ≥0.85 trên gold set | Admin review local, LLM là extension |
| Performance | Đạt NFR-001..004 trong môi trường ghi nhận | Giảm claim scale, tối ưu bottleneck có evidence |
| Resilience | Zero lost logical task trong fault scenarios; duplicate logical result = 0 | Document limitation/fix trước demo |

Target chỉ freeze sau pilot và GVHD review.

## 17. Phân tích thống kê

- Báo mean/median và bootstrap 95% CI cho ranking metric theo query nếu đủ mẫu.
- Paired bootstrap/randomization cho hybrid vs baseline trên cùng query set.
- Báo effect size/delta, không chỉ p-value.
- Không thực hiện nhiều kiểm định tùy ý sau khi xem test; pre-register variants trong Experiment Record.
- Với sample nhỏ, ưu tiên CI/error analysis và diễn giải giới hạn.

## 18. Error analysis

Mỗi lỗi gán một hoặc nhiều category:

- Section/encoding/language detection.
- Skill alias/ambiguity/unknown.
- Date overlap/missing date.
- Required vs preferred extraction.
- Title/level mismatch.
- Cross-language semantic failure.
- Transferable skill false positive.
- Missing evidence/unsupported explanation.
- Annotation disagreement/data quality.
- Out-of-scope job family.

Báo top category, ví dụ thật đã ẩn danh và tác động đến metric/claim.

## 19. Reproducibility record

Mỗi ExperimentRun lưu:

```text
experiment_id
hypothesis
dataset_version + split hash
annotation_guideline_version
schema/taxonomy/model/algorithm versions
code commit
dependency lock hash
random seed
environment/hardware
command/config
start/end time
raw predictions artifact
metrics artifact
notes/deviations
```

Không sửa artifact kết quả; rerun tạo ExperimentRun mới.

## 20. Trình tự thực hiện

1. Freeze schema v1 và annotation guideline draft.
2. Smoke dataset và parsing baseline.
3. Pilot annotation, đo agreement, sửa rubric.
4. Freeze split/test và taxonomy base.
5. Chạy lexical/rule/embedding baselines.
6. Tune hybrid trên validation.
7. Freeze Algorithm v1 và experiment protocol.
8. Chạy test một lần chính thức, lưu artifacts.
9. Explanation/taxonomy/performance/resilience evaluations.
10. Error analysis, limitations và claim cuối.
