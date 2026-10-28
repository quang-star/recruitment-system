export type CandidateView = "dashboard" | "profile" | "cv" | "jobs" | "applications" | "notifications" | "security";
export type CandidateAccountView = Exclude<CandidateView, "jobs" | "notifications">;

export const candidateAccountLinks: { id: CandidateAccountView; label: string }[] = [
  { id: "dashboard", label: "Tổng quan" },
  { id: "profile", label: "Hồ sơ" },
  { id: "cv", label: "CV của tôi" },
  { id: "applications", label: "Việc làm đã ứng tuyển" },
  { id: "security", label: "Bảo mật" }
];
