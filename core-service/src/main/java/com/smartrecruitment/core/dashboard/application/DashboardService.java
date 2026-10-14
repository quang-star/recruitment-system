package com.smartrecruitment.core.dashboard.application;

import com.smartrecruitment.core.dashboard.application.port.DashboardRepository;
import com.smartrecruitment.core.recruiter.application.CompanyNotFoundException;
import com.smartrecruitment.core.recruiter.application.port.CompanyRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class DashboardService {
    private final DashboardRepository dashboard;
    private final CompanyRepository companies;

    public DashboardService(DashboardRepository dashboard, CompanyRepository companies) {
        this.dashboard = dashboard;
        this.companies = companies;
    }

    @Transactional(readOnly = true)
    public DashboardResult get(UUID userId, List<String> roles, UUID companyId) {
        if (roles.contains("RECRUITER")) {
            if (companyId == null || !companies.isActiveMember(companyId, userId)) {
                throw new CompanyNotFoundException();
            }
            return new DashboardResult("RECRUITER", dashboard.recruiterMetrics(userId, companyId));
        }
        return new DashboardResult("CANDIDATE", dashboard.candidateMetrics(userId));
    }

    public record DashboardResult(String audience, Map<String, Long> metrics) { }
}

