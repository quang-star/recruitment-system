# Vision & Scope

| Thuộc tính | Giá trị |
|---|---|
| Mã tài liệu | DOC-VS-001 |
| Phiên bản | 0.2.0 |
| Trạng thái | Working baseline |
| Owner | Tác giả đồ án |

## 1. Tóm tắt điều hành

Hệ thống hỗ trợ ứng viên và nhà tuyển dụng trong giai đoạn tìm kiếm, ứng tuyển và sàng lọc ban đầu cho lĩnh vực CNTT. CV và JD được chuyển thành biểu diễn có cấu trúc, chuẩn hóa theo taxonomy mở, sau đó đối sánh bằng phương pháp hybrid kết hợp luật nghiệp vụ và biểu diễn ngữ nghĩa. Kết quả gồm tổng điểm, điểm thành phần, điểm mạnh, khoảng thiếu và evidence trích từ tài liệu. LLM là thành phần tùy chọn để gợi ý thuật ngữ mới hoặc diễn đạt, không quyết định điểm và không tự loại ứng viên. Sản phẩm có thể tiếp nhận nhiều vị trí CNTT; thực nghiệm chỉ tuyên bố trên các nhóm vị trí có dữ liệu gán nhãn. Auth, quản lý job/application và queue là phần hỗ trợ. Đóng góp chính phải được chứng minh bằng benchmark parsing, ranking, explanation và performance.

## 2. Tên đề tài

### Tên khuyến nghị

**[ĐÃ CHỐT] “Thiết kế và đánh giá hệ thống hỗ trợ phân tích CV và xác định mức độ phù hợp với vị trí tuyển dụng trong lĩnh vực Công nghệ thông tin bằng AI.”**

Đây là working baseline để trình GVHD/trường. Nếu trường yêu cầu tên ngắn hơn, dùng **“Hệ thống hỗ trợ tuyển dụng CNTT tích hợp AI cho phân tích CV và matching công việc”**. Việc đổi tên trình bày không mở rộng phạm vi MVP. Chỉ dùng tên “Hệ thống tuyển dụng thông minh tích hợp AI” khi nhà trường yêu cầu chính thức.

Lý do:

- “Hệ thống hỗ trợ” xác định AI chỉ hỗ trợ phân tích và đánh giá ban đầu, không quyết định tuyển dụng.
- “Thiết kế và đánh giá” yêu cầu vừa có sản phẩm vừa có thực nghiệm.
- “Phân tích CV và xác định mức độ phù hợp” bao quát parsing, normalization, matching và explanation.
- “Trong lĩnh vực Công nghệ thông tin” giới hạn dataset, taxonomy và kết luận hiện tại; kiến trúc vẫn có thể mở rộng sang ngành khác sau đồ án.

Không dùng “hệ thống tuyển dụng tự động” vì hệ thống không được quyết định tuyển dụng hoặc auto-reject.

## 3. Phân biệt sản phẩm và đóng góp nghiên cứu

| Khía cạnh | Sản phẩm phần mềm | Đóng góp nghiên cứu |
|---|---|---|
| Mục đích | Hoàn thiện luồng Candidate–Recruiter–Admin | Trả lời RQ và chứng minh phương pháp |
| Thành phần | Auth, company, job, CV, application, dashboard, queue | Parsing, normalization, hybrid matching, evidence/explanation, evaluation |
| Tiêu chí đạt | Luồng nghiệp vụ đúng, an toàn, dùng được | Có baseline, dữ liệu, metric, kết quả và phân tích sai số |
| Giá trị | Demo hệ thống end-to-end | Kết luận có giới hạn và tái lập được |
| Rủi ro | Scope creep CRUD/hạ tầng | LLM-only, thiếu ground truth, claim vượt dữ liệu |

## 4. Problem statement

- Candidate khó biết CV phù hợp với JD ở điểm nào và còn thiếu gì.
- Recruiter xử lý nhiều CV, dễ phụ thuộc từ khóa hoặc đánh giá không nhất quán.
- Tên công nghệ/alias thay đổi nhanh trong CNTT, taxonomy tĩnh dễ lỗi thời.
- Semantic similarity đơn lẻ khó xử lý hard constraint; rule-only khó hiểu đồng nghĩa/ngữ cảnh.
- Nhiều hệ thống đưa điểm mà không dẫn evidence, gây khó kiểm chứng và rủi ro thiên lệch.

## 5. Mục tiêu nghiệp vụ

| Mã | Mục tiêu | Chỉ dấu thành công |
|---|---|---|
| BO-01 | Giúp Candidate hiểu mức phù hợp của Application với JD | Có breakdown, matched/missing criteria và evidence sau khi ứng tuyển |
| BO-02 | Giúp Recruiter sàng lọc nhất quán hơn | Có ranking theo JD, không auto-reject, truy vết được lý do |
| BO-03 | Giảm thao tác nhập lại CV/JD | Parsing có confirm/edit và confidence |
| BO-04 | Duy trì taxonomy trước thay đổi công nghệ | Có PendingSkill, Admin review, version và audit |
| BO-05 | Bảo vệ dữ liệu và giảm quyết định thiên lệch | PII bị loại khỏi matching; quyền xem CV theo mục đích |

## 6. Mục tiêu nghiên cứu

| Mã | Mục tiêu |
|---|---|
| RO-01 | Thiết kế schema trích xuất có cấu trúc cho CV/JD Việt–Anh trong CNTT |
| RO-02 | Xây dựng normalization dựa trên taxonomy, alias, fuzzy/semantic candidate generation và human confirmation |
| RO-03 | Thiết kế phương pháp hybrid đa tiêu chí kết hợp rule-based và semantic representation |
| RO-04 | Tạo explanation chỉ từ score component và evidence có thể kiểm chứng |
| RO-05 | So sánh hybrid với rule-only, lexical và embedding-only trên dữ liệu gán nhãn |
| RO-06 | Đánh giá parsing, ranking, explanation, latency và giới hạn khái quát hóa |

## 7. Câu hỏi nghiên cứu

| Mã | Câu hỏi | Bằng chứng dự kiến |
|---|---|---|
| RQ-01 | Schema và pipeline nào trích xuất/chuẩn hóa CV–JD Việt–Anh đủ ổn định cho matching? | Entity-level Precision/Recall/F1, error analysis |
| RQ-02 | Hybrid rule + semantic có cải thiện ranking so với từng baseline riêng lẻ không? | nDCG@K, MRR, Recall@K, kiểm định/CI phù hợp |
| RQ-03 | Phân rã đa tiêu chí và penalty hard constraint ảnh hưởng ranking như thế nào? | Ablation study và phân tích nhóm lỗi |
| RQ-04 | Explanation dựa trên evidence có đúng, đủ hiểu và tránh unsupported claim không? | Human rubric, evidence precision, unsupported-claim rate |
| RQ-05 | Cơ chế LLM-propose/Admin-confirm giúp taxonomy mở rộng với chi phí/rủi ro nào? | Precision đề xuất, acceptance/merge/reject rate, review time |
| RQ-06 | Hệ thống đáp ứng hiệu năng và khả năng phục hồi ở quy mô demo/định hướng scale không? | p95 latency, throughput, retry, failure recovery |

## 8. Phạm vi

### 8.1 Research core — Must

- PDF text extraction và input text.
- ParsedCV/ParsedJD có evidence span và confidence.
- Skill/job-title normalization cho CNTT.
- Taxonomy/alias có version.
- Phát hiện thuật ngữ chưa biết và luồng Admin review.
- Hybrid multi-criteria matching.
- Score breakdown, matched/missing requirements.
- Evidence-grounded explanation có template fallback.
- Baselines, dataset, annotation và evaluation.
- Reproducibility: lưu input/schema/taxonomy/model/algorithm version.

### 8.2 MVP support features — Must

- Candidate, Recruiter, Admin và RBAC cơ bản.
- Company profile và quan hệ Recruiter–Company.
- Job/JD draft, confirm, publish và close; Closed không reopen trong MVP.
- CV upload, version, confirm/edit và trạng thái xử lý.
- Candidate duyệt Job Published, ứng tuyển và xem giải thích của Application thuộc chính mình sau khi matching hoàn tất.
- Recruiter xem applicant ranking và cập nhật trạng thái.
- Queue, retry, idempotency và failure visibility.
- Audit cho taxonomy, trạng thái application và xử lý dữ liệu nhạy cảm.

### 8.3 Should have

- Candidate rút application ở các trạng thái cho phép.
- Reprocessing có kiểm soát khi taxonomy/algorithm đổi.
- Dashboard chất lượng pipeline và pending review.
- LLM adapter cho skill proposal/explanation wording sau khi redaction.
- Export kết quả experiment và audit.

### 8.4 Future extension

- OCR CV scan/ảnh.
- DOCX và nhiều loại tài liệu.
- Company Admin riêng, nhiều recruiter/quyền chi tiết.
- Job-title taxonomy đa ngành.
- Multilingual ngoài Việt–Anh.
- Interview scheduling, notification, chat, offer/onboarding.
- Active learning, learning-to-rank sau khi có dữ liệu đủ lớn.
- Kubernetes/service mesh chỉ khi có nhu cầu vận hành thực.

### 8.5 Out of scope

- Tuyển dụng ngoài lĩnh vực CNTT trong claim của đồ án.
- Auto-interview, face/voice/personality analysis.
- Auto-reject hoặc quyết định tuyển dụng tự động.
- Dùng thuộc tính nhạy cảm làm feature matching.
- Crawling job/CV không có quyền sử dụng.
- Fine-tune LLM lớn.
- Payroll, HRM, payment/subscription.
- Hạ tầng production đa vùng.

## 9. Phạm vi hỗ trợ và phạm vi đã kiểm chứng

| Mức | Ý nghĩa | Cách hiển thị/claim |
|---|---|---|
| Accepted | Hệ thống nhận và parse được tài liệu CNTT | Không đồng nghĩa matching đã được kiểm chứng |
| Supported | Có taxonomy/rule và test chức năng | Ghi rõ nhóm vị trí và phiên bản |
| Evaluated | Có dữ liệu gán nhãn và metric | Được phép dùng trong kết luận thực nghiệm |

**[ĐÃ CHỐT]** Ưu tiên thu thập dữ liệu cho Backend, Frontend, Full-stack, DevOps và Data/AI. Chỉ các nhóm đạt độ phủ tối thiểu sau pilot mới được đưa vào tập test và kết luận thực nghiệm; điều này không thu hẹp phạm vi tiếp nhận của sản phẩm.

## 10. Giả định và giới hạn

| Mã | Trạng thái | Giả định/giới hạn |
|---|---|---|
| AS-01 | [ĐÃ CHỐT] | Chỉ tuyển dụng CNTT trong đồ án |
| AS-02 | [ĐÃ CHỐT] | Candidate/Recruiter xác nhận dữ liệu parse trước khi dùng làm nguồn chính |
| AS-03 | [ĐÃ CHỐT] | LLM không quyết định score và không auto-approve taxonomy |
| AS-04 | [ĐÃ CHỐT] | MVP chỉ nhận CV PDF có text ≤10 MB; JD text/form là luồng chính; PDF mật khẩu/hỏng/chỉ có ảnh, OCR, ảnh chụp, CV viết tay và layout phức tạp ngoài scope |
| AS-05 | [ĐÃ CHỐT] | Việt–Anh/mixed; chất lượng được báo cáo tách theo ngôn ngữ |
| AS-06 | [ĐÃ CHỐT] | Hai annotator gán độc lập pilot 50–100 cặp và toàn bộ final test cốt lõi; annotator thứ hai chưa định danh nhưng phải có kinh nghiệm CNTT/tuyển dụng kỹ thuật |
| AS-07 | [CẦN XÁC NHẬN] | Có quyền sử dụng đủ CV/JD thật hoặc tổng hợp đã ẩn danh |
| AS-08 | [ĐÃ CHỐT] | Phát triển/demo local bằng Docker Compose trên i5-11300H, RAM 16 GB, GTX 1650; public VPS sau khi hoàn thiện; không Kubernetes/Eureka/service mesh trong MVP |
| AS-09 | [ĐÃ CHỐT] | MVP chỉ ranking Candidate đã apply; không sourcing; interview/offer/onboarding ngoài scope |
| AS-10 | [ĐÃ CHỐT] | Hoàn thành tính năng MVP trước 2026-08-31; tháng 9/2026 dành cho kiểm thử, đánh giá, báo cáo và triển khai |

## 11. Success criteria và Definition of Done

| Nhóm | Tiêu chí tối thiểu |
|---|---|
| Parsing | Có ground truth và báo Precision/Recall/F1 theo field/ngôn ngữ |
| Matching | Hybrid được so sánh với tối thiểu rule-only, lexical và embedding-only |
| Explainability | Mọi claim trong explanation có component/evidence; đo unsupported-claim rate |
| Taxonomy | Unknown term → Pending → approve/edit/merge/reject → version/audit hoạt động |
| Product | Hai luồng Candidate và Recruiter chạy end-to-end |
| Resilience | Retry/idempotency/failure state được kiểm thử; Core vẫn cho apply nếu AI tạm lỗi |
| Privacy | PII không vào feature matching; external LLM chỉ nhận redacted minimal context |
| Reproducibility | Có dataset/config/code/schema/model/algorithm version cho kết quả báo cáo |
| Claim | Kết luận ghi đúng nhóm vị trí và quy mô dữ liệu đã đánh giá |

Target số học chi tiết là [ĐỀ XUẤT] trong `10-evaluation-plan.md`, chỉ freeze sau pilot.

## 12. Các điểm cần freeze sớm

1. [CẦN XÁC NHẬN] Gửi tên working baseline cho GVHD/trường phê duyệt chính thức.
2. [CẦN XÁC NHẬN] Kiểm tra provenance, quyền sử dụng, consent và PII của từng nguồn dữ liệu.
3. [CẦN XÁC NHẬN] Xác định danh tính annotator thứ hai và adjudicator trước annotation pilot.
4. [CẦN XÁC NHẬN] Sau pilot, xác định nhóm nào trong năm nhóm ưu tiên đạt độ phủ tối thiểu để đưa vào tập test và kết luận.
5. [CẦN XÁC NHẬN] Chốt retention trước khi dùng dữ liệu thật hoặc public VPS.
