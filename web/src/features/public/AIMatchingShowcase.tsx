import { FC } from "react";
import { SparklesIcon, CvIcon, CheckCircleIcon, LayersIcon } from "../../shared/components/Icon";

export const AIMatchingShowcase: FC = () => {
  return (
    <section className="ai-matching-section" id="ai-matching-section">
      <div className="section-container">
        <div className="section-title-wrap text-center">
          <span className="section-kicker">CÔNG NGHỆ ĐỘT PHÁ</span>
          <h2>Quy trình Tuyển dụng Thông minh với AI</h2>
          <p className="section-subtitle">
            Hệ thống kết hợp xử lý ngôn ngữ tự nhiên (NLP), OCR tiếng Việt và thuật toán đối sánh minh bạch có trích xuất bằng chứng xác thực.
          </p>
        </div>

        <div className="ai-steps-grid">
          <div className="ai-step-card">
            <div className="step-number">01</div>
            <div className="step-icon-wrap bg-blue">
              <CvIcon size={24} />
            </div>
            <h3>Bóc tách CV tự động (OCR & NLP)</h3>
            <p>
              Hệ thống đọc dữ liệu text từ PDF, tự động kích hoạt Tesseract OCR khi gặp CV dạng ảnh scan. Chuẩn hóa kỹ năng theo IT Taxonomy v1.
            </p>
          </div>

          <div className="ai-step-card">
            <div className="step-number">02</div>
            <div className="step-icon-wrap bg-teal">
              <SparklesIcon size={24} />
            </div>
            <h3>Explainable AI Matching</h3>
            <p>
              Thuật toán đối sánh kỹ năng bắt buộc, kỹ năng ưu tiên và thời gian kinh nghiệm không chồng lấn. Điểm số hỗ trợ nhà tuyển dụng xem xét hồ sơ.
            </p>
          </div>

          <div className="ai-step-card">
            <div className="step-number">03</div>
            <div className="step-icon-wrap bg-indigo">
              <CheckCircleIcon size={24} />
            </div>
            <h3>Bằng chứng xác thực (Evidence-Backed)</h3>
            <p>
              Kỹ năng được trích xuất có tham chiếu vị trí nguồn khi xác định được. Với CV scan hoặc dữ liệu người dùng bổ sung, có thể cần kiểm tra thêm bằng chứng.
            </p>
          </div>

          <div className="ai-step-card">
            <div className="step-number">04</div>
            <div className="step-icon-wrap bg-purple">
              <LayersIcon size={24} />
            </div>
            <h3>Event-Driven Microservices</h3>
            <p>
              Tách biệt Bounded Contexts qua Kafka KRaft, đảm bảo tính nhất quán dữ liệu bằng Transactional Outbox và Idempotent Consumers.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
