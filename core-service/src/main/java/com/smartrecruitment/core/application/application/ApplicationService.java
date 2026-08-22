package com.smartrecruitment.core.application.application;

import com.smartrecruitment.core.application.application.port.ApplicationRepository;
import com.smartrecruitment.core.application.domain.Application;
import com.smartrecruitment.core.application.domain.ApplicationStatus;
import org.springframework.stereotype.Service;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class ApplicationService {
    private final ApplicationRepository applications;

    public ApplicationService(ApplicationRepository applications) { this.applications = applications; }

    @Transactional
    public Application apply(UUID candidateUserId, UUID jobId, UUID cvId) {
        try {
            return applications.insert(candidateUserId, jobId, cvId);
        } catch (DataIntegrityViolationException exception) {
            throw new ApplicationConflictException();
        }
    }

    @Transactional(readOnly = true)
    public List<Application> findMine(UUID candidateUserId) { return applications.findAllForCandidate(candidateUserId); }

    @Transactional(readOnly = true)
    public List<Application> findForRecruiter(UUID recruiterUserId, UUID jobId) {
        return applications.findAllForRecruiter(recruiterUserId, jobId);
    }

    @Transactional
    public Application updateStatus(UUID recruiterUserId, UUID applicationId, ApplicationStatus target,
                                    String reason, long expectedVersion) {
        Application current = applications.findForRecruiter(recruiterUserId, applicationId)
                .orElseThrow(ApplicationNotFoundException::new);
        validateTransition(current.status(), target, reason);
        return applications.updateStatus(recruiterUserId, applicationId, target, reason, expectedVersion)
                .orElseThrow(ApplicationConflictException::new);
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
}
