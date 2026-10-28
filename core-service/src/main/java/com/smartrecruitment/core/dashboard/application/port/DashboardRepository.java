package com.smartrecruitment.core.dashboard.application.port;

import java.util.Map;

public interface DashboardRepository {
    Map<String, Long> candidateMetrics(Long userId);
    Map<String, Long> recruiterMetrics(Long userId, Long companyId);
    PendingJobInfo findPendingActionJob(Long userId, Long companyId);

    record PendingJobInfo(Long jobId, String jobTitle) { }
}

