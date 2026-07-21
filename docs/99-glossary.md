# Glossary

| Thuật ngữ | Định nghĩa dùng trong đồ án |
|---|---|
| AI Worker | Process xử lý parsing, normalization, embedding, matching/reprocessing từ task/event |
| AlgorithmVersion | Phiên bản bất biến của công thức, weight, penalty, threshold và code/config liên quan |
| Applicant ranking | Xếp hạng những Candidate đã ứng tuyển vào một Job; khác với sourcing toàn kho |
| Application | Đơn ứng tuyển liên kết Candidate, Job, CVVersion và JobVersion snapshot |
| Business Rule | Quy tắc điều kiện–hành động–kết quả ràng buộc nghiệp vụ, mã `BR-*` |
| Candidate | Ứng viên sở hữu profile/CV và chủ động ứng tuyển |
| Canonical skill | Tên chuẩn trong taxonomy, có stable ID |
| Confidence | Chỉ báo độ tin cậy vận hành của extraction/mapping; không mặc nhiên là xác suất đã calibration |
| CVVersion | Snapshot bất biến của một lần tải/nội dung CV |
| Degraded result | Kết quả được tính bằng fallback do thiếu một thành phần, có quality flag |
| Evidence | Đoạn/span/provenance trong CV/JD hỗ trợ một field, component hoặc explanation fact |
| Evaluated scope | Nhóm vị trí/ngôn ngữ đã có dữ liệu, metric và được phép dùng trong kết luận |
| Explainability | Khả năng chỉ ra component, matched/missing criteria và evidence dẫn đến kết quả |
| External LLM | Dịch vụ mô hình ngôn ngữ bên ngoài; là dependency tùy chọn, không đáng tin mặc định |
| Functional Requirement | Hành vi quan sát/kiểm thử được của hệ thống, mã `FR-*` |
| Hard constraint | Yêu cầu bắt buộc đã được Recruiter xác nhận; gây penalty/flag nhưng không auto-reject |
| Hybrid matching | Kết hợp rule/taxonomy với biểu diễn ngữ nghĩa và aggregation có version |
| Idempotency | Cùng logical request/event xử lý nhiều lần không tạo nhiều logical effect/result |
| Job | Vòng đời tin tuyển dụng; nội dung cụ thể nằm trong JobVersion |
| Job family | Nhóm nghề CNTT như Backend, Frontend, DevOps, Data/AI |
| JobVersion | Snapshot bất biến của JD/Job content được parse/publish |
| LLM-only | Cách dùng LLM quyết định trực tiếp output/score; không phải phương pháp chính của đồ án |
| MatchingComponent | Một tiêu chí thành phần như required skill, experience, semantic responsibility |
| MatchingResult | Kết quả bất biến cho một tuple input/taxonomy/model/algorithm version |
| Multi-criteria | Tính phù hợp từ nhiều tiêu chí thay vì một cosine/keyword score duy nhất |
| Non-functional Requirement | Thuộc tính chất lượng đo được, mã `NFR-*` |
| Normalization | Map raw term/title/date sang biểu diễn chuẩn có taxonomy/version/provenance |
| Outbox | Pattern lưu event cùng transaction nghiệp vụ để tránh mất sự kiện |
| ParsedCV/ParsedJD | Biểu diễn có cấu trúc theo schema version, tách khỏi raw document |
| PendingSkill | Thuật ngữ chưa map được, chờ Admin approve/edit/merge/reject/defer |
| PII | Thông tin định danh cá nhân như tên, email, điện thoại, địa chỉ, ảnh |
| Provisional | Dữ liệu/kết quả chưa được con người xác nhận hoặc chưa đủ điều kiện chính thức |
| Quality flag | Cờ mô tả limitation/trạng thái như low confidence, degraded semantic, outside evaluated scope |
| Recruiter | Người thuộc Company, tạo Job và xử lý Application |
| Reprocessing | Chạy lại parsing/embedding/matching do input/taxonomy/model/algorithm version đổi |
| Semantic embedding | Vector biểu diễn ngữ nghĩa; không đồng nghĩa score phù hợp cuối cùng |
| Skill alias | Biến thể đã duyệt map về một canonical skill, ví dụ JS → JavaScript |
| Skill taxonomy | Danh mục skill canonical, alias, type/category/relation có version |
| Supported scope | Nhóm có taxonomy/rule/test chức năng; có thể chưa có benchmark đủ để claim chất lượng |
| TaxonomyVersion | Snapshot bất biến của taxonomy dùng để normalize/match |
| Unsupported claim | Câu explanation không được component/input/evidence hỗ trợ |

## Quy ước ngôn ngữ

- Trong tài liệu kỹ thuật có thể dùng `CV`, `JD`, `matching`, `embedding`, `evidence`, `taxonomy`; lần đầu trong báo cáo cần giải thích tiếng Việt.
- Dùng “mức độ phù hợp” thay cho “xác suất được tuyển”.
- Dùng “không tìm thấy bằng chứng trong CV hiện tại” thay cho “ứng viên không có kỹ năng”.
- Dùng “hỗ trợ sàng lọc” thay cho “tự động tuyển dụng”.
- Dùng “nhóm đã được đánh giá” thay cho “hệ thống chính xác cho toàn CNTT”.

