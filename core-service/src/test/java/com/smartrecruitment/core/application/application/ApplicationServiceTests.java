package com.smartrecruitment.core.application.application;

import com.smartrecruitment.core.application.application.port.ApplicationRepository;
import com.smartrecruitment.core.application.domain.Application;
import com.smartrecruitment.core.application.domain.ApplicationSource;
import com.smartrecruitment.core.application.domain.ApplicationStatus;
import com.smartrecruitment.core.application.domain.ApplicationStatusChange;
import com.smartrecruitment.core.cv.application.CvUploadedEvent;
import com.smartrecruitment.core.cv.application.port.OutboxEventRepository;
import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.assertThat;

class ApplicationServiceTests {
    @Test
    void rejectsInvalidStatusTransition() {
        UUID recruiter = UUID.randomUUID();
        FakeApplications repository = new FakeApplications(application(ApplicationStatus.REJECTED));
        ApplicationService service = new ApplicationService(repository);

        assertThatThrownBy(() -> service.updateStatus(recruiter, repository.application.publicId(),
                ApplicationStatus.SHORTLISTED, null, 0))
                .isInstanceOf(ApplicationStateException.class);
    }

    @Test
    void requiresReasonWhenRejecting() {
        FakeApplications repository = new FakeApplications(application(ApplicationStatus.SUBMITTED));
        ApplicationService service = new ApplicationService(repository);

        assertThatThrownBy(() -> service.updateStatus(UUID.randomUUID(), repository.application.publicId(),
                ApplicationStatus.REJECTED, " ", 0))
                .isInstanceOf(ApplicationStateException.class);
    }

    @Test
    void requiresExplicitCvSharingConsent() {
        ApplicationService service = new ApplicationService(new FakeApplications(application(ApplicationStatus.SUBMITTED)));

        assertThatThrownBy(() -> service.apply(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), false, "cv-sharing-v1"))
                .isInstanceOf(ApplicationStateException.class);
    }

    @Test
    void candidateCanWithdrawSubmittedApplicationWithReason() {
        Application current = application(ApplicationStatus.SUBMITTED);
        FakeApplications repository = new FakeApplications(current);
        ApplicationService service = new ApplicationService(repository);

        Application withdrawn = service.withdraw(current.candidateUserId(), current.publicId(), "Accepted another offer", 0);

        assertThat(withdrawn.status()).isEqualTo(ApplicationStatus.WITHDRAWN);
    }

    @Test
    void candidateCannotWithdrawShortlistedApplication() {
        Application current = application(ApplicationStatus.SHORTLISTED);
        ApplicationService service = new ApplicationService(new FakeApplications(current));

        assertThatThrownBy(() -> service.withdraw(current.candidateUserId(), current.publicId(), "Changed plans", 0))
                .isInstanceOf(ApplicationStateException.class);
    }

    @Test
    void idempotentReplayDoesNotAppendSecondOutboxEvent() {
        Application current = application(ApplicationStatus.SUBMITTED);
        FakeApplications repository = new FakeApplications(current);
        RecordingOutbox outbox = new RecordingOutbox();
        ApplicationService service = new ApplicationService(repository, outbox);
        UUID candidate = current.candidateUserId();
        UUID job = current.jobId();
        UUID cv = current.cvId();
        UUID cvVersion = current.cvVersionId();
        UUID correlation = UUID.randomUUID();

        Application first = service.apply(candidate, job, cv, cvVersion, "Hello", true,
                "cv-sharing-v1", "retry-key", correlation);
        Application replay = service.apply(candidate, job, cv, cvVersion, "Hello", true,
                "cv-sharing-v1", "retry-key", correlation);

        assertThat(replay.publicId()).isEqualTo(first.publicId());
        assertThat(outbox.applicationEvents).isEqualTo(1);
    }

    private static Application application(ApplicationStatus status) {
        OffsetDateTime now = OffsetDateTime.now();
        return new Application(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                UUID.randomUUID(), UUID.randomUUID(), null, status, ApplicationSource.DIRECT, now, now, 0);
    }

    private static final class FakeApplications implements ApplicationRepository {
        private final Application application;
        private boolean submitted;
        private FakeApplications(Application application) { this.application = application; }
        @Override public Application insert(UUID candidateUserId, UUID jobId, UUID cvId) { return application; }
        @Override public ApplicationSubmission submit(UUID candidateUserId, UUID jobId, UUID cvId, UUID cvVersionId,
                                                      String coverLetter, boolean consentAccepted, String policyVersion,
                                                      String idempotencyKeyHash, String requestHash) {
            boolean created = !submitted;
            submitted = true;
            return new ApplicationSubmission(application, created);
        }
        @Override public List<Application> findAllForCandidate(UUID candidateUserId) { return List.of(application); }
        @Override public Optional<Application> findForCandidate(UUID candidateUserId, UUID applicationId) { return Optional.of(application); }
        @Override public List<Application> findAllForRecruiter(UUID recruiterUserId, UUID jobId) { return List.of(application); }
        @Override public Optional<Application> findForRecruiter(UUID recruiterUserId, UUID applicationId) { return Optional.of(application); }
        @Override public Optional<Application> updateStatus(UUID recruiterUserId, UUID applicationId, ApplicationStatus status, String reason, long expectedVersion) { return Optional.of(application); }
        @Override public Optional<Application> withdraw(UUID candidateUserId, UUID applicationId, String reason, long expectedVersion) {
            OffsetDateTime now = application.updatedAt();
            return Optional.of(new Application(application.publicId(), application.candidateUserId(), application.companyId(),
                    application.cvId(), application.cvVersionId(), application.jobId(), application.jobVersionId(),
                    application.coverLetter(), ApplicationStatus.WITHDRAWN, application.source(), application.appliedAt(), now,
                    application.version() + 1));
        }
        @Override public List<ApplicationStatusChange> findHistoryForViewer(UUID viewerUserId, UUID applicationId) {
            return List.of(new ApplicationStatusChange(UUID.randomUUID(), null, ApplicationStatus.SUBMITTED,
                    application.candidateUserId(), null, application.appliedAt()));
        }
    }

    private static final class RecordingOutbox implements OutboxEventRepository {
        private int applicationEvents;
        @Override public void append(CvUploadedEvent event) { }
        @Override public void append(ApplicationSubmittedEvent event) { applicationEvents++; }
    }
}
