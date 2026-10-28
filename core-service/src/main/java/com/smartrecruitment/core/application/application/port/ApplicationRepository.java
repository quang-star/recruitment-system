package com.smartrecruitment.core.application.application.port;

import com.smartrecruitment.core.application.application.ApplicationSearch;
import com.smartrecruitment.core.application.application.ApplicationSubmission;
import com.smartrecruitment.core.application.domain.Application;
import com.smartrecruitment.core.application.domain.ApplicationCvSnapshot;
import com.smartrecruitment.core.application.domain.ApplicationStatus;
import com.smartrecruitment.core.application.domain.ApplicationStatusChange;
import com.smartrecruitment.core.shared.application.PageResult;

import java.util.List;
import java.util.Optional;

public interface ApplicationRepository {
    PageResult<Application> searchForCandidate(Long userId,
            ApplicationSearch search);
    PageResult<Application> searchForRecruiter(Long userId, Long jobId,
            ApplicationSearch search);
    Application insert(Long candidateUserId, Long jobId, Long cvId);
    default Application insert(Long candidateUserId, Long jobId, Long cvId,
                               boolean consentAccepted, String policyVersion) {
        return insert(candidateUserId, jobId, cvId);
    }
    default ApplicationSubmission submit(Long candidateUserId, Long jobId, Long cvId, Long cvVersionId,
                                         String coverLetter, boolean consentAccepted, String policyVersion,
                                         String idempotencyKeyHash, String requestHash) {
        return new ApplicationSubmission(insert(candidateUserId, jobId, cvId, consentAccepted, policyVersion), true);
    }
    List<Application> findAllForCandidate(Long candidateUserId);
    Optional<Application> findForCandidate(Long candidateUserId, Long applicationId);
    List<Application> findAllForRecruiter(Long recruiterUserId, Long jobId);
    Optional<Application> findForRecruiter(Long recruiterUserId, Long applicationId);
    Optional<Application> updateStatus(Long recruiterUserId, Long applicationId, ApplicationStatus status,
                                       String reason, long expectedVersion);
    Optional<Application> withdraw(Long candidateUserId, Long applicationId, String reason, long expectedVersion);
    default boolean revokeCvAccess(Long candidateUserId, Long applicationId, long expectedVersion) {
        throw new UnsupportedOperationException("CV access revocation is unavailable");
    }
    List<ApplicationStatusChange> findHistoryForViewer(Long viewerUserId, Long applicationId);
    default Optional<ApplicationCvSnapshot> findCvSnapshotForRecruiter(Long recruiterUserId, Long applicationId) {
        return Optional.empty();
    }
}
