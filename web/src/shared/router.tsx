import { ReactNode, useCallback } from "react";
import { BrowserRouter, NavigateOptions, To, useInRouterContext, useNavigate } from "react-router-dom";
import { requestBeforeNavigate } from "./navigation";

/** Ensures router hooks work cleanly both in production (<main>) and isolated component unit tests. */
export function EnsureRouter({ children }: { children: ReactNode }) {
  const inRouter = useInRouterContext();
  if (inRouter) return <>{children}</>;
  return <BrowserRouter>{children}</BrowserRouter>;
}

/** React Router navigate wrapper that respects active unsaved-changes guards. */
export function useSafeNavigate() {
  const navigate = useNavigate();
  return useCallback(
    (to: To, options?: NavigateOptions) => {
      if (!requestBeforeNavigate()) return false;
      navigate(to, options);
      window.dispatchEvent(new Event("app:navigate"));
      return true;
    },
    [navigate]
  );
}

/** Canonical application routes shared across public portal and role workspaces. */
export const routes = {
  home: "/",
  jobs: "/jobs",
  jobDetail: (jobId: string) => `/jobs/${encodeURIComponent(jobId)}`,
  companies: "/companies",
  companyProfile: (companyId: string) => `/companies/${encodeURIComponent(companyId)}`,
  aiShowcase: "/ai",
  login: "/login",
  verifyEmail: "/verify-email",
  resetPassword: "/reset-password",
  acceptInvitation: "/accept-invitation",
  candidate: {
    dashboard: "/candidate",
    profile: "/candidate/profile",
    cv: "/candidate/cv",
    applications: "/candidate/applications",
    notifications: "/candidate/notifications",
    security: "/candidate/security"
  },
  recruiter: {
    dashboard: "/recruiter",
    jobs: "/recruiter/jobs",
    newJob: "/recruiter/jobs/new",
    jobDetail: (jobId: string) => `/recruiter/jobs/${encodeURIComponent(jobId)}`,
    applications: "/recruiter/applications",
    company: "/recruiter/company",
    notifications: "/recruiter/notifications",
    security: "/recruiter/security"
  },
  admin: {
    dashboard: "/admin",
    companies: "/admin/companies",
    overview: "/admin/overview",
    catalog: "/admin/catalog",
    audit: "/admin/audit",
    security: "/admin/security"
  }
} as const;

/** Maps legacy query-parameter URLs (?job=, ?view=search, ?view=companies&company=) to canonical routes. */
export function resolveLegacyPortalPath(search: string): string | null {
  const params = new URLSearchParams(search);
  const jobId = params.get("job");
  if (jobId) return routes.jobDetail(jobId);

  const view = params.get("view");
  const companyId = params.get("company");
  if (view === "companies") {
    return companyId ? routes.companyProfile(companyId) : routes.companies;
  }
  if (view === "search") {
    const next = new URLSearchParams();
    for (const key of ["keyword", "location", "category", "salary", "workMode", "page"]) {
      const value = params.get(key);
      if (value) next.set(key, value);
    }
    const qs = next.toString();
    return qs ? `${routes.jobs}?${qs}` : routes.jobs;
  }
  if (view === "ai_showcase") {
    return routes.aiShowcase;
  }
  if (params.get("auth") === "login") {
    return routes.login;
  }
  return null;
}
