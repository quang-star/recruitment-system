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
    void outsideIndustryApplicationDoesNotRequestMatching() {
        var c = application(ApplicationStatus.SUBMITTED);
        var outside = new Application(c.id(), c.candidateUserId(), c.companyId(), c.cvId(), c.cvVersionId(),
                c.jobId(), c.jobVersionId(), c.coverLetter(), c.status(), c.source(), c.appliedAt(), c.updatedAt(), c.version(), false);
        var outbox = new RecordingOutbox();
        var service = new ApplicationService(new FakeApplications(outside), outbox);
        assertThat(service.apply(c.candidateUserId(), c.jobId(), c.cvId()).matchingSupported()).isFalse();
        assertThat(outbox.applicationEvents).isZero();
    }
    @Test
    void rejectsInvalidStatusTransition() {
        Long recruiter = com.smartrecruitment.core.support.TestIds.next();
        FakeApplications repository = new FakeApplications(application(ApplicationStatus.REJECTED));
        ApplicationService service = new ApplicationService(repository);

        assertThatThrownBy(() -> service.updateStatus(recruiter, repository.application.id(),
                ApplicationStatus.SHORTLISTED, null, 0))
                .isInstanceOf(ApplicationStateException.class);
    }

    @Test
    void requiresReasonWhenRejecting() {
        FakeApplications repository = new FakeApplications(application(ApplicationStatus.SUBMITTED));
        ApplicationService service = new ApplicationService(repository);

        assertThatThrownBy(() -> service.updateStatus(com.smartrecruitment.core.support.TestIds.next(), repository.application.id(),
                ApplicationStatus.REJECTED, " ", 0))
                .isInstanceOf(ApplicationStateException.class);
    }

    @Test
    void requiresExplicitCvSharingConsent() {
        ApplicationService service = new ApplicationService(new FakeApplications(application(ApplicationStatus.SUBMITTED)));

        assertThatThrownBy(() -> service.apply(com.smartrecruitment.core.support.TestIds.next(), com.smartrecruitment.core.support.TestIds.next(), com.smartrecruitment.core.support.TestIds.next(), false, "cv-sharing-v1"))
                .isInstanceOf(ApplicationStateException.class);
    }

    @Test
    void candidateCanWithdrawSubmittedApplicationWithReason() {
        Application current = application(ApplicationStatus.SUBMITTED);
        FakeApplications repository = new FakeApplications(current);
        ApplicationService service = new ApplicationService(repository);

        Application withdrawn = service.withdraw(current.candidateUserId(), current.id(), "Accepted another offer", 0);

        assertThat(withdrawn.status()).isEqualTo(ApplicationStatus.WITHDRAWN);
    }

    @Test
    void candidateCanWithdrawShortlistedApplication() {
        Application current = application(ApplicationStatus.SHORTLISTED);
        ApplicationService service = new ApplicationService(new FakeApplications(current));

        assertThat(service.withdraw(current.candidateUserId(), current.id(), "Changed plans", 0).status())
                .isEqualTo(ApplicationStatus.WITHDRAWN);
    }

    @Test
    void candidateCannotWithdrawTerminalApplication() {
        for (var status : List.of(ApplicationStatus.REJECTED, ApplicationStatus.WITHDRAWN)) {
            Application current = application(status);
            ApplicationService service = new ApplicationService(new FakeApplications(current));
            assertThatThrownBy(() -> service.withdraw(current.candidateUserId(), current.id(), "Changed plans", 0))
                    .isInstanceOf(ApplicationStateException.class);
        }
    }

    @Test
    void shortlistedWithdrawalStillRequiresReason() {
        Application current = application(ApplicationStatus.SHORTLISTED);
        ApplicationService service = new ApplicationService(new FakeApplications(current));
        assertThatThrownBy(() -> service.withdraw(current.candidateUserId(), current.id(), " ", 0))
                .isInstanceOf(ApplicationStateException.class);
    }

    @Test
    void idempotentReplayDoesNotAppendSecondOutboxEvent() {
        Application current = application(ApplicationStatus.SUBMITTED);
        FakeApplications repository = new FakeApplications(current);
        RecordingOutbox outbox = new RecordingOutbox();
        ApplicationService service = new ApplicationService(repository, outbox);
        Long candidate = current.candidateUserId();
        Long job = current.jobId();
        Long cv = current.cvId();
        Long cvVersion = current.cvVersionId();
        UUID correlation = UUID.randomUUID();

        Application first = service.apply(candidate, job, cv, cvVersion, "Hello", true,
                "cv-sharing-v1", "retry-key", correlation);
        Application replay = service.apply(candidate, job, cv, cvVersion, "Hello", true,
                "cv-sharing-v1", "retry-key", correlation);

        assertThat(replay.id()).isEqualTo(first.id());
        assertThat(outbox.applicationEvents).isEqualTo(1);
    }

    private static Application application(ApplicationStatus status) {
        OffsetDateTime now = OffsetDateTime.now();
        return new Application(com.smartrecruitment.core.support.TestIds.next(), com.smartrecruitment.core.support.TestIds.next(), com.smartrecruitment.core.support.TestIds.next(), com.smartrecruitment.core.support.TestIds.next(), com.smartrecruitment.core.support.TestIds.next(),
                com.smartrecruitment.core.support.TestIds.next(), com.smartrecruitment.core.support.TestIds.next(), null, status, ApplicationSource.DIRECT, now, now, 0);
    }

    private static final class FakeApplications implements ApplicationRepository {
        public com.smartrecruitment.core.shared.application.PageResult<Application> searchForCandidate(Long userId,
                com.smartrecruitment.core.application.application.ApplicationSearch search) {
            throw new UnsupportedOperationException("Paging is covered by repository integration tests");
        }
        public com.smartrecruitment.core.shared.application.PageResult<Application> searchForRecruiter(Long userId, Long jobId,
                com.smartrecruitment.core.application.application.ApplicationSearch search) {
            throw new UnsupportedOperationException("Paging is covered by repository integration tests");
        }

        private final Application application;
        private boolean submitted;
        private FakeApplications(Application application) { this.application = application; }
        @Override public Application insert(Long candidateUserId, Long jobId, Long cvId) { return application; }
        @Override public ApplicationSubmission submit(Long candidateUserId, Long jobId, Long cvId, Long cvVersionId,
                                                      String coverLetter, boolean consentAccepted, String policyVersion,
                                                      String idempotencyKeyHash, String requestHash) {
            boolean created = !submitted;
            submitted = true;
            return new ApplicationSubmission(application, created);
        }
        @Override public List<Application> findAllForCandidate(Long candidateUserId) { return List.of(application); }
        @Override public Optional<Application> findForCandidate(Long candidateUserId, Long applicationId) { return Optional.of(application); }
        @Override public List<Application> findAllForRecruiter(Long recruiterUserId, Long jobId) { return List.of(application); }
        @Override public Optional<Application> findForRecruiter(Long recruiterUserId, Long applicationId) { return Optional.of(application); }
        @Override public Optional<Application> updateStatus(Long recruiterUserId, Long applicationId, ApplicationStatus status, String reason, long expectedVersion) { return Optional.of(application); }
        @Override public Optional<Application> withdraw(Long candidateUserId, Long applicationId, String reason, long expectedVersion) {
            OffsetDateTime now = application.updatedAt();
            return Optional.of(new Application(application.id(), application.candidateUserId(), application.companyId(),
                    application.cvId(), application.cvVersionId(), application.jobId(), application.jobVersionId(),
                    application.coverLetter(), ApplicationStatus.WITHDRAWN, application.source(), application.appliedAt(), now,
                    application.version() + 1));
        }
        @Override public List<ApplicationStatusChange> findHistoryForViewer(Long viewerUserId, Long applicationId) {
            return List.of(new ApplicationStatusChange(com.smartrecruitment.core.support.TestIds.next(), null, ApplicationStatus.SUBMITTED,
                    application.candidateUserId(), null, application.appliedAt()));
        }
    }

    private static final class RecordingOutbox implements OutboxEventRepository {
        private int applicationEvents;
        @Override public void append(CvUploadedEvent event) { }
        @Override public void append(ApplicationSubmittedEvent event) { applicationEvents++; }
    }
}
