package com.smartrecruitment.core.application.application;

import com.smartrecruitment.core.application.application.port.ApplicationRepository;
import com.smartrecruitment.core.application.domain.Application;
import com.smartrecruitment.core.application.domain.ApplicationStatus;
import com.smartrecruitment.core.application.domain.ApplicationStatusChange;
import com.smartrecruitment.core.cv.application.port.OutboxEventRepository;
import com.smartrecruitment.core.notification.application.NotificationService;
import com.smartrecruitment.core.shared.application.PageResult;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

@Service
public class ApplicationService {
    private final ApplicationRepository applications;
    private final OutboxEventRepository outbox;
    private final NotificationService notifications;

    public ApplicationService(ApplicationRepository applications) { this(applications, event -> { }, null); }

    public ApplicationService(ApplicationRepository applications, OutboxEventRepository outbox) {
        this(applications, outbox, null);
    }

    @Autowired
    public ApplicationService(ApplicationRepository applications, OutboxEventRepository outbox,
                              NotificationService notifications) {
        this.applications = applications;
        this.outbox = outbox;
        this.notifications = notifications;
    }

    @Transactional
    public Application apply(Long candidateUserId, Long jobId, Long cvId) {
        return apply(candidateUserId, jobId, cvId, true, "cv-sharing-v1");
    }

    @Transactional
    public Application apply(Long candidateUserId, Long jobId, Long cvId,
                             boolean consentAccepted, String policyVersion) {
        return apply(candidateUserId, jobId, cvId, null, null, consentAccepted, policyVersion,
                UUID.randomUUID().toString(), UUID.randomUUID());
    }

    @Transactional
    public Application apply(Long candidateUserId, Long jobId, Long cvId, Long cvVersionId,
                             String coverLetter, boolean consentAccepted, String policyVersion,
                             String idempotencyKey, UUID correlationId) {
        if (!consentAccepted) throw new ApplicationStateException("CV sharing consent is required");
        if (policyVersion == null || policyVersion.isBlank() || policyVersion.length() > 80) {
            throw new ApplicationStateException("A valid consent policy version is required");
        }
        if (idempotencyKey == null || idempotencyKey.isBlank() || idempotencyKey.length() > 200) {
            throw new IllegalArgumentException("Idempotency-Key must contain between 1 and 200 characters");
        }
        if (correlationId == null) throw new IllegalArgumentException("Correlation ID is required");
        String normalizedCoverLetter = normalizeCoverLetter(coverLetter);
        String idempotencyKeyHash = sha256(idempotencyKey.trim());
        String requestHash = sha256(String.join("\n", candidateUserId.toString(), jobId.toString(),
                cvId.toString(), cvVersionId == null ? "ACTIVE" : cvVersionId.toString(),
                normalizedCoverLetter == null ? "" : normalizedCoverLetter,
                Boolean.toString(consentAccepted), policyVersion.trim()));
        try {
            ApplicationSubmission submission = applications.submit(candidateUserId, jobId, cvId, cvVersionId,
                    normalizedCoverLetter, consentAccepted, policyVersion.trim(), idempotencyKeyHash, requestHash);
            if (submission.created()) {
                if (submission.application().matchingSupported()) {
                    outbox.append(ApplicationSubmittedEvent.from(submission.application(), correlationId));
                }
                if (notifications != null) notifications.applicationSubmitted(submission.application());
            }
            return submission.application();
        } catch (DataIntegrityViolationException exception) {
            throw new ApplicationConflictException();
        }
    }

    @Transactional(readOnly = true)
    public List<Application> findMine(Long candidateUserId) { return applications.findAllForCandidate(candidateUserId); }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public PageResult<Application> searchMine(Long userId, ApplicationSearch search) {
        return applications.searchForCandidate(userId, search);
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public PageResult<Application> searchForRecruiter(Long userId, Long jobId,
                                                                                                ApplicationSearch search) {
        return applications.searchForRecruiter(userId, jobId, search);
    }

    @Transactional(readOnly = true)
    public Application getMine(Long candidateUserId, Long applicationId) {
        return applications.findForCandidate(candidateUserId, applicationId)
                .orElseThrow(ApplicationNotFoundException::new);
    }

    @Transactional(readOnly = true)
    public List<Application> findForRecruiter(Long recruiterUserId, Long jobId) {
        return applications.findAllForRecruiter(recruiterUserId, jobId);
    }

    @Transactional(readOnly = true)
    public Application getForRecruiter(Long recruiterUserId, Long applicationId) {
        return applications.findForRecruiter(recruiterUserId, applicationId)
                .orElseThrow(ApplicationNotFoundException::new);
    }

    @Transactional(readOnly = true)
    public List<ApplicationStatusChange> history(Long viewerUserId, Long applicationId) {
        List<ApplicationStatusChange> history = applications.findHistoryForViewer(viewerUserId, applicationId);
        if (history.isEmpty()) throw new ApplicationNotFoundException();
        return history;
    }

    @Transactional
    public Application withdraw(Long candidateUserId, Long applicationId, String reason, long expectedVersion) {
        Application current = getMine(candidateUserId, applicationId);
        if (current.status() != ApplicationStatus.SUBMITTED
                && current.status() != ApplicationStatus.UNDER_REVIEW
                && current.status() != ApplicationStatus.SHORTLISTED) {
            throw new ApplicationStateException("Only a submitted, under-review or shortlisted application can be withdrawn");
        }
        if (reason == null || reason.isBlank()) {
            throw new ApplicationStateException("A reason is required to withdraw an application");
        }
        Application withdrawn = applications.withdraw(candidateUserId, applicationId, reason, expectedVersion)
                .orElseThrow(ApplicationConflictException::new);
        outbox.append(com.smartrecruitment.core.cv.application.PrivacyEvent.revoked(applicationId));
        return withdrawn;
    }

    @Transactional
    public void revokeCvAccess(Long candidateUserId, Long applicationId, long expectedVersion) {
        getMine(candidateUserId, applicationId);
        if (!applications.revokeCvAccess(candidateUserId, applicationId, expectedVersion)) throw new ApplicationConflictException();
        outbox.append(com.smartrecruitment.core.cv.application.PrivacyEvent.revoked(applicationId));
    }

    @Transactional
    public Application updateStatus(Long recruiterUserId, Long applicationId, ApplicationStatus target,
                                    String reason, long expectedVersion) {
        Application current = applications.findForRecruiter(recruiterUserId, applicationId)
                .orElseThrow(ApplicationNotFoundException::new);
        validateTransition(current.status(), target, reason);
        Application updated = applications.updateStatus(recruiterUserId, applicationId, target, reason, expectedVersion)
                .orElseThrow(ApplicationConflictException::new);
        if (notifications != null) notifications.applicationStatusChanged(updated);
        return updated;
    }

    private void validateTransition(ApplicationStatus from, ApplicationStatus to, String reason) {
        boolean allowed = switch (from) {
            case SUBMITTED -> to == ApplicationStatus.UNDER_REVIEW || to == ApplicationStatus.REJECTED;
            case UNDER_REVIEW -> to == ApplicationStatus.SHORTLISTED || to == ApplicationStatus.REJECTED;
            case SHORTLISTED -> to == ApplicationStatus.REJECTED;
            case REJECTED, WITHDRAWN -> false;
        };
        if (!allowed) throw new ApplicationStateException("Invalid application status transition");
        if ((to == ApplicationStatus.REJECTED || to == ApplicationStatus.WITHDRAWN)
                && (reason == null || reason.isBlank())) {
            throw new ApplicationStateException("A reason is required for this status");
        }
    }

    private static String normalizeCoverLetter(String coverLetter) {
        if (coverLetter == null || coverLetter.isBlank()) return null;
        String normalized = coverLetter.trim();
        if (normalized.length() > 5000) {
            throw new IllegalArgumentException("Cover letter must not exceed 5000 characters");
        }
        return normalized;
    }

    private static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }
}
