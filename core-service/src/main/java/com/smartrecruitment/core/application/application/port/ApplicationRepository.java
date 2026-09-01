package com.smartrecruitment.core.application.application.port;

import com.smartrecruitment.core.application.domain.Application;
import com.smartrecruitment.core.application.domain.ApplicationStatus;
import com.smartrecruitment.core.application.domain.ApplicationStatusChange;
import com.smartrecruitment.core.application.application.ApplicationSubmission;
import com.smartrecruitment.core.application.domain.ApplicationCvSnapshot;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ApplicationRepository {
    Application insert(UUID candidateUserId, UUID jobId, UUID cvId);
    default Application insert(UUID candidateUserId, UUID jobId, UUID cvId,
                               boolean consentAccepted, String policyVersion) {
        return insert(candidateUserId, jobId, cvId);
    }
    default ApplicationSubmission submit(UUID candidateUserId, UUID jobId, UUID cvId, UUID cvVersionId,
                                         String coverLetter, boolean consentAccepted, String policyVersion,
                                         String idempotencyKeyHash, String requestHash) {
        return new ApplicationSubmission(insert(candidateUserId, jobId, cvId, consentAccepted, policyVersion), true);
    }
    List<Application> findAllForCandidate(UUID candidateUserId);
    Optional<Application> findForCandidate(UUID candidateUserId, UUID applicationId);
    List<Application> findAllForRecruiter(UUID recruiterUserId, UUID jobId);
    Optional<Application> findForRecruiter(UUID recruiterUserId, UUID applicationId);
    Optional<Application> updateStatus(UUID recruiterUserId, UUID applicationId, ApplicationStatus status,
                                       String reason, long expectedVersion);
    Optional<Application> withdraw(UUID candidateUserId, UUID applicationId, String reason, long expectedVersion);
    List<ApplicationStatusChange> findHistoryForViewer(UUID viewerUserId, UUID applicationId);
    default Optional<ApplicationCvSnapshot> findCvSnapshotForRecruiter(UUID recruiterUserId, UUID applicationId) {
        return Optional.empty();
    }
}
