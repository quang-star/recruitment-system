package com.smartrecruitment.core.dashboard.application;

import com.smartrecruitment.core.dashboard.application.port.DashboardRepository;
import com.smartrecruitment.core.dashboard.application.port.DashboardRepository.PendingJobInfo;
import com.smartrecruitment.core.recruiter.application.CompanyNotFoundException;
import com.smartrecruitment.core.recruiter.application.port.CompanyRepository;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class DashboardServiceTests {
    private final DashboardRepository dashboard = mock(DashboardRepository.class);
    private final CompanyRepository companies = mock(CompanyRepository.class);
    private final DashboardService service = new DashboardService(dashboard, companies);

    @Test
    void recruiterDashboardIncludesMetricsAndPendingJobWhenActionNeeded() {
        Long userId = com.smartrecruitment.core.support.TestIds.next();
        Long companyId = com.smartrecruitment.core.support.TestIds.next();
        Long pendingJobId = com.smartrecruitment.core.support.TestIds.next();

        when(companies.isActiveMember(companyId, userId)).thenReturn(true);
        when(dashboard.recruiterMetrics(userId, companyId)).thenReturn(Map.of(
                "jobs", 5L,
                "publishedJobs", 3L,
                "draftJobs", 1L,
                "closedJobs", 1L,
                "applications", 10L,
                "submitted", 4L,
                "underReview", 2L,
                "shortlisted", 3L,
                "rejected", 1L
        ));
        when(dashboard.findPendingActionJob(userId, companyId))
                .thenReturn(new PendingJobInfo(pendingJobId, "Senior Java Backend Engineer"));

        var result = service.get(userId, List.of("RECRUITER"), companyId);

        assertThat(result.audience()).isEqualTo("RECRUITER");
        assertThat(result.pendingJobId()).isEqualTo(pendingJobId);
        assertThat(result.pendingJobTitle()).isEqualTo("Senior Java Backend Engineer");
        assertThat(result.metrics().get("submitted")).isEqualTo(4L);
        assertThat(result.metrics().get("underReview")).isEqualTo(2L);
        assertThat(result.metrics().get("draftJobs")).isEqualTo(1L);
    }

    @Test
    void recruiterDashboardReturnsNullPendingJobWhenNoPendingApplications() {
        Long userId = com.smartrecruitment.core.support.TestIds.next();
        Long companyId = com.smartrecruitment.core.support.TestIds.next();

        when(companies.isActiveMember(companyId, userId)).thenReturn(true);
        when(dashboard.recruiterMetrics(userId, companyId)).thenReturn(Map.of(
                "jobs", 2L,
                "publishedJobs", 2L,
                "draftJobs", 0L,
                "closedJobs", 0L,
                "applications", 5L,
                "submitted", 0L,
                "underReview", 0L,
                "shortlisted", 5L
        ));
        when(dashboard.findPendingActionJob(userId, companyId)).thenReturn(null);

        var result = service.get(userId, List.of("RECRUITER"), companyId);

        assertThat(result.audience()).isEqualTo("RECRUITER");
        assertThat(result.pendingJobId()).isNull();
        assertThat(result.pendingJobTitle()).isNull();
        assertThat(result.metrics().get("submitted")).isEqualTo(0L);
    }

    @Test
    void candidateDashboardReturnsCandidateAudienceAndNoPendingJob() {
        Long userId = com.smartrecruitment.core.support.TestIds.next();

        when(dashboard.candidateMetrics(userId)).thenReturn(Map.of(
                "cvs", 1L,
                "applications", 3L,
                "submitted", 1L,
                "underReview", 1L,
                "shortlisted", 1L
        ));

        var result = service.get(userId, List.of("CANDIDATE"), null);

        assertThat(result.audience()).isEqualTo("CANDIDATE");
        assertThat(result.pendingJobId()).isNull();
        assertThat(result.pendingJobTitle()).isNull();
        assertThat(result.metrics().get("submitted")).isEqualTo(1L);
    }

    @Test
    void recruiterWithoutActiveCompanyMembershipThrowsException() {
        Long userId = com.smartrecruitment.core.support.TestIds.next();
        Long companyId = com.smartrecruitment.core.support.TestIds.next();

        when(companies.isActiveMember(companyId, userId)).thenReturn(false);

        assertThatThrownBy(() -> service.get(userId, List.of("RECRUITER"), companyId))
                .isInstanceOf(CompanyNotFoundException.class);
    }
}
