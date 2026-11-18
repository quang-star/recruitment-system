package com.smartrecruitment.core.dashboard.application.port;

import java.util.Map;

public interface DashboardRepository {
    Map<String, Long> candidateMetrics(Long userId);
    default Map<String, Long> recruiterMetrics(Long userId, Long companyId) {
        return recruiterMetrics(userId, companyId, null);
    }
    Map<String, Long> recruiterMetrics(Long userId, Long companyId, Integer days);
    PendingJobInfo findPendingActionJob(Long userId, Long companyId);

    record PendingJobInfo(Long jobId, String jobTitle) { }
}

