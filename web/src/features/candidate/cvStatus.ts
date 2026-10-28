export const cvStatusLabels: Record<string, string> = {
  UPLOADED: "Đã tải lên", QUEUED: "Đang chờ phân tích", PROCESSING: "AI đang phân tích",
  PARSED: "Cần kiểm tra", NEEDS_REVIEW: "Cần kiểm tra", CONFIRMED: "Sẵn sàng ứng tuyển",
  REJECTED: "Tệp không hợp lệ", FAILED: "Phân tích chưa thành công",
  SUPERSEDED: "Đã có phiên bản mới", DELETED: "Đã xóa"
};

export const pendingCvStatuses = ["UPLOADED", "QUEUED", "PROCESSING"];
export const reviewCvStatuses = ["PARSED", "NEEDS_REVIEW"];

export function canRetryCv(status: string, code: string | null): boolean {
  return status === "FAILED" && code === "SOURCE_STORAGE_UNAVAILABLE";
}

export function cvFailureInstruction(code: string | null): string {
  switch (code) {
    case "SOURCE_STORAGE_UNAVAILABLE":
      return "Dịch vụ lưu trữ chưa kết nối được sau các lần thử lại. Bạn có thể bấm Thử lại sau; không cần tải lại tệp.";
    case "SOURCE_STORAGE_ACCESS_DENIED":
    case "SOURCE_STORAGE_READ_FAILED":
    case "SOURCE_OBJECT_REF_INVALID":
      return "Hệ thống chưa truy cập được tệp CV. Hãy liên hệ người quản trị để kiểm tra.";
    case "SOURCE_OBJECT_NOT_FOUND":
      return "Không tìm thấy tệp CV đã tải lên. Hãy tải một bản CV mới.";
    case "CV_SOURCE_HASH_MISMATCH":
      return "Tệp lưu trữ không khớp với bản CV đã tải lên. Hãy tải một bản CV mới.";
    case "CV_PDF_PARSE_FAILED":
      return "Không đọc được nội dung PDF. Hãy kiểm tra tệp có mở được và không bị khóa bằng mật khẩu, rồi tải một bản mới.";
    default:
      return "Chưa phân tích được CV. Hãy kiểm tra tệp PDF hoặc liên hệ người quản trị.";
  }
}

export type CvOverview = {
  cvId: string;
  title: string;
  status: string;
  activeVersion: { processingStatus: string };
};
