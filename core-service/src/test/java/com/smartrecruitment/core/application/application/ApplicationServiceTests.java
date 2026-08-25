package com.smartrecruitment.core.application.application;

import com.smartrecruitment.core.application.application.port.ApplicationRepository;
import com.smartrecruitment.core.application.domain.Application;
import com.smartrecruitment.core.application.domain.ApplicationSource;
import com.smartrecruitment.core.application.domain.ApplicationStatus;
import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

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

    private static Application application(ApplicationStatus status) {
        OffsetDateTime now = OffsetDateTime.now();
        return new Application(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                UUID.randomUUID(), UUID.randomUUID(), status, ApplicationSource.DIRECT, now, now, 0);
    }

    private static final class FakeApplications implements ApplicationRepository {
        private final Application application;
        private FakeApplications(Application application) { this.application = application; }
        @Override public Application insert(UUID candidateUserId, UUID jobId, UUID cvId) { return application; }
        @Override public List<Application> findAllForCandidate(UUID candidateUserId) { return List.of(application); }
        @Override public List<Application> findAllForRecruiter(UUID recruiterUserId, UUID jobId) { return List.of(application); }
        @Override public Optional<Application> findForRecruiter(UUID recruiterUserId, UUID applicationId) { return Optional.of(application); }
        @Override public Optional<Application> updateStatus(UUID recruiterUserId, UUID applicationId, ApplicationStatus status, String reason, long expectedVersion) { return Optional.of(application); }
    }
}
