/**
 * Cấu hình thương hiệu và tiêu đề hiển thị tập trung cho toàn ứng dụng.
 * Mặc định để trống "" theo yêu cầu người dùng, có thể cấu hình qua biến môi trường VITE_APP_NAME.
 */
export const BRAND_CONFIG = {
  /**
   * Tên thương hiệu hiển thị.
   * Để trống "" mặc định; nếu có giá trị sẽ hiển thị kèm logo.
   */
  name: (import.meta.env.VITE_APP_NAME as string | undefined) ?? "",

  /**
   * Khẩu hiệu phụ (để trống nếu không dùng).
   */
  tagline: (import.meta.env.VITE_APP_TAGLINE as string | undefined) ?? "",

  /**
   * Nhãn chức năng mặc định khi tên thương hiệu để trống "".
   */
  defaultPortalLabel: "Cổng Tuyển dụng IT",
  defaultCandidateLabel: "Không gian Ứng viên",
  defaultRecruiterLabel: "Quản trị Tuyển dụng",
} as const;
