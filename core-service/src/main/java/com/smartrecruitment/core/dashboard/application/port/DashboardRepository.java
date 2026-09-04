package com.smartrecruitment.core.dashboard.application.port;

import java.util.Map;
import java.util.UUID;

public interface DashboardRepository {
    Map<String, Long> candidateMetrics(UUID userId);
    Map<String, Long> recruiterMetrics(UUID userId, UUID companyId);
}

