import type { BodySection, CvLanguage } from "./cvDocument";

export type CvWritingSuggestion = {
  id: string;
  section: Extract<BodySection, "introduction" | "skills" | "experiences" | "projects">;
  roleTag: string;
  title: string;
  content: string;
  tip: string;
};

export const CV_WRITING_SUGGESTIONS: Record<CvLanguage, readonly CvWritingSuggestion[]> = {
  vi: [
    {
      id: "vi-intro-backend",
      section: "introduction",
      roleTag: "Backend · Java / Node",
      title: "Mục tiêu nghề nghiệp Backend",
      content:
        "Kỹ sư phần mềm với kinh nghiệm thiết kế REST API, tối ưu truy vấn SQL và vận hành hệ thống microservices ổn định. Mong muốn đóng góp vào các sản phẩm có lượng truy cập lớn, chú trọng độ tin cậy dữ liệu và khả năng mở rộng.",
      tip: "Nêu rõ số năm kinh nghiệm, công nghệ cốt lõi và giá trị mang lại cho đội ngũ.",
    },
    {
      id: "vi-intro-frontend",
      section: "introduction",
      roleTag: "Frontend · React / TS",
      title: "Mục tiêu nghề nghiệp Frontend",
      content:
        "Lập trình viên Frontend chuyên TypeScript & React, có kinh nghiệm xây dựng giao diện đáp ứng, chuẩn truy cập và tối ưu tốc độ tải trang. Hướng tới trải nghiệm người dùng mượt mà và mã nguồn dễ bảo trì.",
      tip: "Kết hợp thế mạnh giao diện (UI/UX, hiệu năng) với công nghệ bạn tự tin nhất.",
    },
    {
      id: "vi-skills-fullstack",
      section: "skills",
      roleTag: "Nhóm kỹ năng chuẩn ATS",
      title: "Phân nhóm kỹ năng rõ ràng",
      content:
        "Ngôn ngữ & Framework: TypeScript, React, Java Spring Boot\nCơ sở dữ liệu & Hạ tầng: PostgreSQL, Redis, Docker, Kafka\nKỹ năng làm việc: Đọc hiểu tài liệu tiếng Anh, Agile/Scrum, Code Review",
      tip: "Tách kỹ năng thành 2–3 nhóm để nhà tuyển dụng và ATS quét từ khóa nhanh.",
    },
    {
      id: "vi-exp-impact",
      section: "experiences",
      roleTag: "Mẫu mô tả kết quả (CAR)",
      title: "Gạch đầu dòng kinh nghiệm có số liệu",
      content:
        "• Thiết kế và triển khai module xử lý hồ sơ giúp rút ngắn 35% thời gian phản hồi API.\n• Chuẩn hóa bộ test tự động giảm lỗi hồi quy trước mỗi đợt phát hành.\n• Phối hợp chặt chẽ với Product & QA hoàn thành đúng tiến độ 100% sprint.",
      tip: "Bắt đầu mỗi dòng bằng động từ hành động (Thiết kế, Tối ưu, Triển khai) + kết quả đo được.",
    },
    {
      id: "vi-proj-system",
      section: "projects",
      roleTag: "Dự án cá nhân / ĐATN",
      title: "Cấu trúc mô tả dự án nổi bật",
      content:
        "• Vai trò & Quy mô: Phát triển chính hệ thống web cho nhóm 4 thành viên.\n• Công nghệ: React, TypeScript, Spring Boot, PostgreSQL.\n• Kết quả: Hoàn thiện luồng nghiệp vụ đầu-cuối, kiểm thử tự động và đóng gói triển khai.",
      tip: "Nêu rõ vai trò cá nhân, kiến trúc kỹ thuật và điểm nhấn giải quyết vấn đề.",
    },
  ],
  en: [
    {
      id: "en-intro-backend",
      section: "introduction",
      roleTag: "Backend · Java / Go",
      title: "Backend Career Objective",
      content:
        "Software Engineer experienced in building fault-tolerant REST APIs, relational data models, and event-driven services. Focused on clean architecture, query performance, and reliable production delivery.",
      tip: "Keep your summary concise (2–3 sentences) tailored to the target role.",
    },
    {
      id: "en-skills-grouped",
      section: "skills",
      roleTag: "ATS Skill Groups",
      title: "Structured Technical Skills",
      content:
        "Languages & Frameworks: TypeScript, React, Java, Spring Boot\nData & Infrastructure: PostgreSQL, Kafka, Docker, Linux\nCollaboration: Agile/Scrum, Technical Documentation, Code Review",
      tip: "Group skills by category instead of a flat comma list for easier scanning.",
    },
    {
      id: "en-exp-impact",
      section: "experiences",
      roleTag: "Impact Bullets",
      title: "Achievement-oriented Bullet Points",
      content:
        "• Architected and shipped core workflow APIs, reducing p95 endpoint latency by 35%.\n• Automated integration and contract tests to prevent regressions across releases.\n• Partnered with product and QA teams to deliver features reliably on schedule.",
      tip: "Lead every bullet with a strong action verb and measurable outcome.",
    },
    {
      id: "en-proj-system",
      section: "projects",
      roleTag: "Capstone / Side Project",
      title: "Project Highlights Template",
      content:
        "• Role: Lead developer in a 4-member engineering team.\n• Stack: React, TypeScript, Spring Boot, PostgreSQL.\n• Outcome: Delivered end-to-end user workflows with automated test coverage.",
      tip: "Highlight your direct ownership and technical tradeoffs.",
    },
  ],
};
