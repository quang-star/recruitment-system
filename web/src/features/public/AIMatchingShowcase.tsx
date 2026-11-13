import { FC } from "react";
import { CheckCircleIcon, CvIcon, LayersIcon, SparklesIcon } from "../../shared/components/Icon";
import { Card } from "../../shared/ui";

export const AIMatchingShowcase: FC = () => {
  const pillars = [
    {
      step: "01",
      title: "Phân tích cấu trúc CV & JD",
      desc: "Trích xuất kỹ năng, vai trò và kinh nghiệm thực tế từ tệp PDF với quyền kiểm tra và chỉnh sửa trước khi xác nhận.",
      icon: CvIcon
    },
    {
      step: "02",
      title: "Chuẩn hóa theo Taxonomy mở",
      desc: "Đối chiếu kỹ năng đồng nghĩa qua danh mục chuẩn hóa và ghi nhận rõ trạng thái chưa có hoặc cần xem xét thủ công.",
      icon: LayersIcon
    },
    {
      step: "03",
      title: "Xếp hạng 1–5 sao kèm bằng chứng",
      desc: "Giải thích điểm mạnh, kỹ năng còn thiếu và trích dẫn ngữ cảnh cụ thể để ứng viên và nhà tuyển dụng cùng kiểm chứng.",
      icon: CheckCircleIcon
    }
  ];

  return (
    <section id="ai-matching-section" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div className="text-center max-w-2xl mx-auto space-y-2.5">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 border border-brand-200 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-brand-700">
          <SparklesIcon size={13} aria-hidden="true" />
          Công nghệ đối chiếu minh bạch
        </span>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink-900 m-0">
          Quy trình Tuyển dụng Thông minh với AI
        </h2>
        <p className="text-sm sm:text-base text-ink-600 m-0 leading-relaxed">
          Hệ thống kết hợp phân tích tài liệu cục bộ và AI có kiểm soát quyền riêng tư nhằm hỗ trợ đối soát kỹ năng chính xác, không tự động loại hồ sơ.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {pillars.map(({ step, title, desc, icon: Icon }) => (
          <Card key={step} padding="md" className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 border border-brand-200">
                <Icon size={20} aria-hidden="true" />
              </span>
              <span className="font-mono text-xs font-bold text-ink-400">{step}</span>
            </div>
            <h3 className="text-base font-bold text-ink-900 m-0">{title}</h3>
            <p className="text-sm text-ink-600 m-0 leading-relaxed">{desc}</p>
          </Card>
        ))}
      </div>
    </section>
  );
};
