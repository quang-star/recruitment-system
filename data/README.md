# Data registry

Ngày lấy dữ liệu: **2026-07-16**.

Thư mục `raw/` là bản chụp dữ liệu nguồn và **không được chỉnh sửa trực tiếp**. Mọi bước làm sạch, ẩn danh, chuẩn hóa taxonomy, tách tập hoặc tạo cặp CV–JD phải được thực hiện bằng script và ghi kết quả sang `interim/` hoặc `processed/`.

## 1. CV — datasetmaster/resumes

- Nguồn: <https://huggingface.co/datasets/datasetmaster/resumes>
- Tệp: `raw/cv/datasetmaster-resumes/master_resumes.jsonl`
- Định dạng: JSON Lines.
- Kích thước: 16,324,910 byte.
- Số bản ghi: 4,817.
- Kiểm tra cú pháp: 4,817 hợp lệ, 0 không hợp lệ.
- Trường cấp cao: `personal_info`, `experience`, `education`, `skills`, `projects`, `certifications`.
- SHA-256: `b8cb2810a5868dc03a6ab4ba49c495316d280996ce28d2ace97be1e0b6bda136`.
- Giấy phép được công bố trên dataset card: MIT.
- Lưu ý nguồn: bộ dữ liệu gồm CV kỹ thuật đã ẩn danh và dữ liệu tổng hợp. Chỉ dùng để phát triển/đánh giá bộ phân tích CV; không mặc nhiên coi đây là nhãn đúng cho bài toán matching.

Không hiển thị hoặc ghi log nội dung `personal_info`. Trước khi tạo tập thí nghiệm phải loại thông tin định danh và kiểm tra trùng lặp.

## 2. JD — VietJobs

### Dữ liệu đầy đủ

- Nguồn dữ liệu: <https://huggingface.co/datasets/dinhieufam/VietJobs>
- Repository dự án: <https://github.com/VinNLP/VietJobs>
- Tệp: `raw/jd/vietjobs-huggingface/VietJobs.csv`.
- Định dạng: CSV.
- Kích thước: 103,110,903 byte.
- Số bản ghi: 48,092.
- Số JD thuộc `công_nghệ_thông_tin_kỹ_thuật_số`: 1,906.
- Số nhóm nghề: 16.
- Trường: `job_title`, `location`, `country`, `qualifications`, `technical_skills`, `soft_skills`, `languages_required`, `experience_required`, `salary`, `contract_type`, `working_hours`, `benefits`, `description`, `requirements_text`, `category`, `salary_min`, `salary_max`, `salary_avg`.
- SHA-256: `85862b06fda4e814fe0c1d8622f173d189c92758345f77df16d1232d0c49d477`.
- Giấy phép: MIT theo repository của tác giả.

### Mã nguồn và metadata đi kèm

- Thư mục: `raw/jd/vietjobs/`.
- Commit: `0ca6db907bf4db5332c90f5045b76911ba395a11`.
- Kiểu lấy: shallow clone ngày 2026-07-16.
- File mẫu: `raw/jd/vietjobs/data/VietJobs_sample.csv`, 5 bản ghi.

Repository chỉ chứa file mẫu; file CSV 48,092 bản ghi ở trên mới là dataset đầy đủ.

## 3. Quy tắc sử dụng trong đồ án

1. Không sửa file trong `raw/` và không commit dữ liệu thô lên Git.
2. Không dùng trường nhạy cảm hoặc thông tin nhận dạng cá nhân để tính điểm phù hợp.
3. CV và JD từ hai nguồn độc lập chưa phải là các cặp matching có nhãn.
4. Ground truth cuối phải được tạo bằng quy trình ghép ứng viên–vị trí và gán nhãn độc lập bởi con người; LLM chỉ hỗ trợ đề xuất, không tự tạo nhãn chuẩn.
5. Chia train/dev/test sau bước loại trùng để tránh rò rỉ dữ liệu.
6. Mọi tập dẫn xuất phải ghi lại script, phiên bản taxonomy, tiêu chí lọc, số lượng trước/sau và checksum.

## 4. Kiểm tra tính toàn vẹn

Checksum chuẩn nằm trong `checksums.sha256`. Có thể kiểm tra trên PowerShell bằng `Get-FileHash -Algorithm SHA256 <đường-dẫn>`.
