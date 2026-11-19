import { FC } from "react";
import { AlertCircleIcon, ArrowRightIcon, CheckCircleIcon, CvIcon } from "../../shared/components/Icon";
import { Badge, Button, Card } from "../../shared/ui";

type AIMatchingShowcaseProps = {
  signedIn?: boolean;
  onExploreJobs?: () => void;
  onOpenCv?: () => void;
};

const JD_REQUIRED_ITEMS = [
  "Java 17+ và Spring Boot (xây dựng REST API)",
  "PostgreSQL (thiết kế bảng, tối ưu truy vấn)",
  "Kinh nghiệm phát triển backend từ 2 năm",
  "Kinh nghiệm làm việc với Kafka (bắt buộc cho dịch vụ đồng bộ dữ liệu)"
];

const JD_PREFERRED_ITEMS = [
  "Docker và quy trình triển khai container"
];

const MATCHED_SKILLS = [
  { label: "Java", note: "Khớp trực tiếp trong kinh nghiệm dự án" },
  { label: "Spring Boot", note: "Khớp trực tiếp ở mô tả dịch vụ REST API" },
  { label: "PostgreSQL", note: "Nhận diện từ cách ghi “Postgres” trong CV" },
  { label: "Docker", note: "Khớp mục ưu tiên của tin tuyển dụng" }
];

const ITEMS_TO_VERIFY = [
  {
    label: "Kafka",
    detail: "Chưa thấy đề cập trong nội dung CV; cần trao đổi thêm nếu vị trí bắt buộc."
  },
  {
    label: "Mốc thời gian kinh nghiệm Java 17+",
    detail: "CV ghi tổng kinh nghiệm backend 3 năm nhưng không nêu rõ phiên bản Java theo từng dự án."
  }
];

export const AIMatchingShowcase: FC<AIMatchingShowcaseProps> = ({
  signedIn = false,
  onExploreJobs,
  onOpenCv
}) => {
  return (
    <section
      id="ai-matching-section"
      aria-labelledby="ai-matching-title"
      className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-8"
    >
      <div className="max-w-3xl space-y-2">
        <h1 id="ai-matching-title" className="text-2xl sm:text-3xl font-bold tracking-tight text-ink-900 m-0">
          Đối chiếu CV với yêu cầu công việc
        </h1>
        <p className="text-sm sm:text-base text-ink-600 m-0 leading-relaxed">
          Với các vị trí CNTT (IT), hệ thống trích xuất kỹ năng, kinh nghiệm từ CV và mô tả công việc để chỉ ra điểm khớp, mục cần kiểm tra thêm kèm đoạn trích từ hồ sơ gốc. Kết quả chỉ hỗ trợ ứng viên chuẩn bị hồ sơ và giúp nhà tuyển dụng rà soát nhanh hơn, không tự động loại ứng viên.
        </p>
      </div>

      <Card as="article" padding="lg" className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-subtle pb-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="neutral" className="rounded-sm">Ví dụ minh họa</Badge>
              <span className="text-xs sm:text-sm text-ink-500">Dữ liệu giả lập cho vị trí CNTT</span>
            </div>
            <h2 className="text-lg font-bold text-ink-900 m-0">
              Vị trí mẫu: Lập trình viên Backend Java (IT)
            </h2>
          </div>
          <p className="text-xs text-ink-500 m-0 max-w-sm">
            Không sử dụng dữ liệu ứng viên thật và không hiển thị điểm số hay cam kết độ chính xác chưa được kiểm chứng.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
          <div className="space-y-5">
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-ink-900 m-0">Yêu cầu tuyển dụng (JD mẫu)</h3>
              <ul className="space-y-1.5 pl-5 m-0 text-sm text-ink-700">
                {JD_REQUIRED_ITEMS.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p className="text-xs text-ink-500 m-0 pt-1">
                <strong className="font-semibold text-ink-700">Ưu tiên:</strong> {JD_PREFERRED_ITEMS.join(", ")}.
              </p>
            </div>

            <div className="border-t border-border-subtle pt-5 space-y-2.5">
              <div className="flex items-center gap-2 text-sm font-bold text-ink-900">
                <CvIcon size={16} className="text-brand-700 shrink-0" aria-hidden="true" />
                <span>Trích đoạn minh họa từ CV</span>
              </div>
              <blockquote className="m-0 border-l-2 border-brand-500 pl-3.5 text-sm text-ink-700 leading-relaxed">
                “Phát triển dịch vụ quản lý đơn hàng bằng Java và Spring Boot, xây dựng REST API kết nối cơ sở dữ liệu Postgres và đóng gói triển khai bằng Docker (2023 – nay).”
              </blockquote>
              <p className="text-xs text-ink-500 m-0">
                Nguồn minh họa: Trang 1 · Mục Kinh nghiệm làm việc (hồ sơ giả lập).
              </p>
            </div>
          </div>

          <div className="space-y-5 border-t lg:border-t-0 lg:border-l border-border-subtle pt-5 lg:pt-0 lg:pl-8">
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 text-sm font-bold text-ink-900">
                <CheckCircleIcon size={16} className="text-emerald-600 shrink-0" aria-hidden="true" />
                <h3 className="text-sm font-bold text-ink-900 m-0">Kỹ năng ghi nhận từ CV</h3>
              </div>
              <ul className="divide-y divide-border-subtle list-none p-0 m-0">
                {MATCHED_SKILLS.map((skill) => (
                  <li key={skill.label} className="py-2 first:pt-0 last:pb-0 text-sm">
                    <strong className="font-semibold text-ink-900">{skill.label}</strong>
                    <span className="block text-xs text-ink-600 mt-0.5">{skill.note}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="border-t border-border-subtle pt-5 space-y-2.5">
              <div className="flex items-center gap-2 text-sm font-bold text-ink-900">
                <AlertCircleIcon size={16} className="text-amber-700 shrink-0" aria-hidden="true" />
                <h3 className="text-sm font-bold text-ink-900 m-0">Mục cần kiểm tra thêm</h3>
              </div>
              <ul className="divide-y divide-border-subtle list-none p-0 m-0">
                {ITEMS_TO_VERIFY.map((item) => (
                  <li key={item.label} className="py-2 first:pt-0 last:pb-0 text-sm">
                    <strong className="font-semibold text-ink-900">{item.label}</strong>
                    <span className="block text-xs text-ink-600 mt-0.5">{item.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </Card>

      <div className="border-t border-border-subtle pt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-1">
          <h2 className="text-sm font-bold text-ink-900 m-0">Áp dụng cho vị trí CNTT (IT)</h2>
          <p className="text-sm text-ink-600 m-0 leading-relaxed">
            Các vị trí ngoài ngành CNTT sử dụng quy trình xem xét hồ sơ thủ công và không áp dụng chấm điểm đối chiếu AI.
          </p>
        </div>

        <div className="space-y-1">
          <h2 className="text-sm font-bold text-ink-900 m-0">Người dùng kiểm tra trước khi xác nhận</h2>
          <p className="text-sm text-ink-600 m-0 leading-relaxed">
            Ứng viên xem và sửa thông tin trích xuất từ CV trước khi nộp; nhà tuyển dụng xác nhận yêu cầu JD trước khi đăng tin IT.
          </p>
        </div>

        <div className="space-y-1">
          <h2 className="text-sm font-bold text-ink-900 m-0">Hỗ trợ người duyệt hồ sơ</h2>
          <p className="text-sm text-ink-600 m-0 leading-relaxed">
            Phân tích cục bộ chạy mặc định; quyết định phỏng vấn hay tuyển dụng luôn thuộc về người phụ trách tuyển dụng.
          </p>
        </div>
      </div>

      {(onExploreJobs || onOpenCv) && (
        <div className="flex flex-wrap items-center gap-3">
          {onExploreJobs && (
            <Button type="button" variant="primary" className="rounded-md" onClick={onExploreJobs}>
              <span>Tìm việc làm</span>
              <ArrowRightIcon size={15} aria-hidden="true" />
            </Button>
          )}
          {onOpenCv && (
            <Button type="button" variant="secondary" className="rounded-md" onClick={onOpenCv}>
              {signedIn ? "Quản lý CV của tôi" : "Tạo tài khoản để tải CV"}
            </Button>
          )}
        </div>
      )}
    </section>
  );
};
