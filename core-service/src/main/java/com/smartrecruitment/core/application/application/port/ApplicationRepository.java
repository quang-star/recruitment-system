package com.smartrecruitment.core.application.application.port;

import com.smartrecruitment.core.application.domain.Application;
import com.smartrecruitment.core.application.domain.ApplicationStatus;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ApplicationRepository {
    Application insert(UUID candidateUserId, UUID jobId, UUID cvId);
    List<Application> findAllForCandidate(UUID candidateUserId);
    List<Application> findAllForRecruiter(UUID recruiterUserId, UUID jobId);
    Optional<Application> findForRecruiter(UUID recruiterUserId, UUID applicationId);
    Optional<Application> updateStatus(UUID recruiterUserId, UUID applicationId, ApplicationStatus status,
                                       String reason, long expectedVersion);
}
