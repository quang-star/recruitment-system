// Only a public job ID is kept here; submitting still requires CV selection and consent.
const key = "smart-recruitment.pending-job";

export function getPendingJobId(): string | null {
  try { return sessionStorage.getItem(key); } catch { return null; }
}

export function setPendingJobId(jobId: string | null) {
  try {
    if (jobId) sessionStorage.setItem(key, jobId);
    else sessionStorage.removeItem(key);
  } catch { /* Navigation still works when browser storage is unavailable. */ }
}
