package com.smartrecruitment.core.dashboard.application;

import com.smartrecruitment.core.dashboard.application.port.DashboardRepository;
import com.smartrecruitment.core.recruiter.application.CompanyNotFoundException;
import com.smartrecruitment.core.recruiter.application.port.CompanyRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

@Service
public class DashboardService {
    private final DashboardRepository dashboard;
    private final CompanyRepository companies;

    public DashboardService(DashboardRepository dashboard, CompanyRepository companies) {
        this.dashboard = dashboard;
        this.companies = companies;
    }

    @Transactional(readOnly = true)
    public DashboardResult get(Long userId, List<String> roles, Long companyId) {
        if (roles.contains("RECRUITER")) {
            if (companyId == null || !companies.isActiveMember(companyId, userId)) {
                throw new CompanyNotFoundException();
            }
            var pendingJob = dashboard.findPendingActionJob(userId, companyId);
            return new DashboardResult(
                    "RECRUITER",
                    dashboard.recruiterMetrics(userId, companyId),
                    pendingJob != null ? pendingJob.jobId() : null,
                    pendingJob != null ? pendingJob.jobTitle() : null
            );
        }
        return new DashboardResult("CANDIDATE", dashboard.candidateMetrics(userId), null, null);
    }

    public record DashboardResult(
            String audience,
            Map<String, Long> metrics,
            Long pendingJobId,
            String pendingJobTitle
    ) { }
}

