export type PublicJob = {
  jobId: string;
  title: string;
  description: string;
  requirementsText: string;
  benefitsText: string | null;
  locationText: string | null;
  workMode: string | null;
  employmentType: string | null;
  seniorityLevel: string | null;
  openings: number;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod?: string | null;
  salaryNegotiable: boolean;
  companyId: string;
  companyName?: string;
  companyLogo?: string;
  jobVersionId?: string;
  matchingSupported?: boolean;
  isVip?: boolean;
  postedDaysAgo?: number;
  publishedAt?: string | null;
  applicationDeadline?: string | null;
  category?: { industryName: string; specializationName?: string | null; positionName?: string | null };
  skills?: string[];
};

export type ActiveNavTab = "home" | "search" | "companies" | "salary_tool" | "ai_showcase";

export type JobDiscovery = {
  locations: string[];
  categories: JobDiscoveryCategory[];
};

export type JobDiscoveryCategory = {
  industryId: string;
  specializationId: string | null;
  name: string;
  jobCount: number;
};
