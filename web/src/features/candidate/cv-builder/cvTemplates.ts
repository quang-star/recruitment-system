import {
  BODY_SECTIONS,
  createCvDocument,
  fromServerDraft,
  SCHEMA,
  type CvDocument,
  type CvDraftRecord,
  type TemplateId,
} from "./cvDocument";

export type TemplateTag = "ATS" | "Đơn giản" | "Harvard" | "Hiện đại" | "Hai cột" | "Tinh gọn";

export type CvTemplateCatalogItem = {
  id: TemplateId;
  title: string;
  subtitle: string;
  tags: readonly TemplateTag[];
  defaultAccent: string;
  description: string;
};

export const TEMPLATE_FILTER_TAGS = [
  "Tất cả",
  "ATS",
  "Đơn giản",
  "Hiện đại",
  "Hai cột",
  "Tinh gọn",
  "Harvard",
] as const;

export type TemplateFilterTag = (typeof TEMPLATE_FILTER_TAGS)[number];

export const CV_TEMPLATE_CATALOG: readonly CvTemplateCatalogItem[] = [
  {
    id: "executive",
    title: "Chuyên Nghiệp · Executive",
    subtitle: "Header màu nổi bật chuẩn TopCV",
    tags: ["Hiện đại", "Hai cột", "ATS"],
    defaultAccent: "#00b14f",
    description: "Header màu toàn phần nổi bật họ tên, ảnh đại diện và chức danh; thân 2 cột cân đối.",
  },
  {
    id: "modern",
    title: "Hiện Đại · Modern",
    subtitle: "Thanh bên nhấn màu · Hai cột",
    tags: ["ATS", "Hiện đại", "Hai cột"],
    defaultAccent: "#0f766e",
    description: "Thanh bên trái nổi bật ảnh, liên hệ, kỹ năng và ngoại ngữ; cột chính cho kinh nghiệm.",
  },
  {
    id: "classic",
    title: "Senior · Classic",
    subtitle: "Tiêu chuẩn ATS một cột",
    tags: ["ATS", "Đơn giản", "Harvard"],
    defaultAccent: "#334155",
    description: "Bố cục một cột chuẩn ATS/Harvard, phân tách đề mục mạch lạc và dễ đọc.",
  },
  {
    id: "minimal",
    title: "Ấn Tượng · Minimal",
    subtitle: "Tinh gọn thanh lịch",
    tags: ["ATS", "Đơn giản", "Tinh gọn"],
    defaultAccent: "#1e3a8a",
    description: "Đường nhấn dọc hiện đại, tiêu đề sắc nét và khoảng trắng thoáng.",
  },
] as const;

/** Builds synthetic Vietnamese sample content for template thumbnails, preview modal and quick start. */
export function createSampleCvDocument(templateId: TemplateId, accentColor?: string): CvDocument {
  const catalog = CV_TEMPLATE_CATALOG.find(item => item.id === templateId);
  const doc = createCvDocument();
  doc.schemaVersion = SCHEMA;
  doc.templateId = templateId;
  doc.accentColor = accentColor ?? catalog?.defaultAccent ?? doc.accentColor;
  doc.sectionOrder = [...BODY_SECTIONS];
  doc.title = `CV mẫu ${catalog?.title ?? templateId}`;
  doc.fullName = "Lê Quang Dũng";
  doc.headline = "Chuyên viên Phát triển Phần mềm";
  doc.email = "quangdung.demo@example.invalid";
  doc.phone = "0912 345 678";
  doc.location = "Quận Cầu Giấy, Hà Nội";
  doc.links = "linkedin.com/in/quangdung-demo\ngithub.com/quangdung-demo";
  doc.introduction =
    "Hơn 3 năm kinh nghiệm phát triển ứng dụng web và dịch vụ hướng nghiệp bằng TypeScript, React và Spring Boot. Chú trọng kiến trúc sạch, tối ưu hiệu năng truy vấn và trải nghiệm người dùng.";
  doc.skills =
    "Ngôn ngữ & Framework: TypeScript, React, Spring Boot, SQL\nCơ sở dữ liệu & Hạ tầng: PostgreSQL, Kafka, Docker\nKỹ năng mềm: Phân tích nghiệp vụ, làm việc nhóm Agile";
  doc.experiences = [
    {
      id: "sample-exp-1",
      title: "Kỹ sư Phần mềm Fullstack",
      subtitle: "Công ty Công nghệ Minh Việt",
      startMonth: "2024-03",
      endMonth: "",
      current: true,
      description:
        "• Thiết kế và triển khai cổng tuyển dụng với React, TypeScript và API RESTful.\n• Tối ưu truy vấn PostgreSQL giúp giảm 35% thời gian tải trang tìm kiếm.\n• Phối hợp đội sản phẩm chuẩn hóa quy trình review code và kiểm thử tự động.",
    },
    {
      id: "sample-exp-2",
      title: "Lập trình viên Frontend",
      subtitle: "Công ty Giải pháp Số An Khang",
      startMonth: "2022-06",
      endMonth: "2024-02",
      current: false,
      description:
        "• Xây dựng bộ thành phần UI dùng chung và biểu mẫu tương tác đa bước.\n• Cải thiện khả năng truy cập bàn phím và hiển thị responsive trên thiết bị di động.",
    },
  ];
  doc.education = [
    {
      id: "sample-edu-1",
      title: "Cử nhân Công nghệ Thông tin",
      subtitle: "Đại học Bách Khoa Hà Nội · Tốt nghiệp loại Giỏi",
      startMonth: "2018-09",
      endMonth: "2022-05",
      current: false,
      description: "Đề tài tốt nghiệp: Hệ thống quản lý quy trình và phân tích hồ sơ ứng viên.",
    },
  ];
  doc.projects = [
    {
      id: "sample-proj-1",
      title: "Nền tảng Quản lý Hồ sơ & Đối chiếu Kỹ năng",
      subtitle: "Trưởng nhóm kỹ thuật · 4 thành viên",
      startMonth: "2024-01",
      endMonth: "2024-10",
      current: false,
      description:
        "Xây dựng trình soạn thảo CV A4 xuất PDF tại trình duyệt và luồng xử lý sự kiện bất đồng bộ qua Kafka.",
    },
  ];
  doc.certificates = [
    {
      id: "sample-cert-1",
      title: "AWS Certified Cloud Practitioner",
      subtitle: "Amazon Web Services",
      startMonth: "2024-08",
      endMonth: "",
      current: false,
      description: "Chứng nhận nền tảng kiến trúc đám mây và bảo mật dịch vụ.",
    },
  ];
  doc.languages = [
    {
      id: "sample-lang-1",
      title: "Tiếng Anh",
      subtitle: "IELTS 7.0 — Đọc hiểu tài liệu kỹ thuật & giao tiếp công việc tốt",
      startMonth: "",
      endMonth: "",
      current: false,
      description: "",
    },
  ];
  return doc;
}

export function cloneDraftToTemplate(
  draft: CvDraftRecord,
  templateId: TemplateId,
  accentColor: string,
): CvDocument {
  const doc = fromServerDraft(draft);
  return {
    ...doc,
    templateId,
    accentColor,
  };
}
