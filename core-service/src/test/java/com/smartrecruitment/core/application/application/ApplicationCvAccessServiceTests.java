package com.smartrecruitment.core.application.application;

import com.smartrecruitment.core.application.application.port.ApplicationRepository;
import com.smartrecruitment.core.application.domain.ApplicationCvSnapshot;
import com.smartrecruitment.core.application.domain.Application;
import com.smartrecruitment.core.application.domain.ApplicationStatus;
import com.smartrecruitment.core.application.domain.ApplicationStatusChange;
import com.smartrecruitment.core.cv.application.port.ObjectStorage;
import org.junit.jupiter.api.Test;

import java.util.Optional;
import java.util.UUID;
import java.util.List;
import java.io.InputStream;
import java.io.ByteArrayInputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ApplicationCvAccessServiceTests {
    @Test
    void createsShortLivedDownloadForAuthorizedSnapshot() {
        UUID recruiterId = UUID.randomUUID();
        UUID applicationId = UUID.randomUUID();
        UUID cvVersionId = UUID.randomUUID();
        ApplicationRepository applications = new FakeApplications(Optional.of(
                new ApplicationCvSnapshot(cvVersionId, "private-cv", "candidate/version.pdf", "backend-cv.pdf", 8)));
        RecordingStorage storage = new RecordingStorage();

        ApplicationCvDownload access = new ApplicationCvAccessService(applications, storage)
                .download(recruiterId, applicationId);

        assertThat(access.cvVersionId()).isEqualTo(cvVersionId);
        assertThat(access.sizeBytes()).isEqualTo(8);
        assertThat(access.content()).isNotNull();
        assertThat(storage.downloadRequests).isEqualTo(1);
    }

    @Test
    void hidesSnapshotWhenRecruiterHasNoActiveGrant() {
        ApplicationRepository applications = new FakeApplications(Optional.empty());
        ObjectStorage storage = new RecordingStorage();
        UUID recruiterId = UUID.randomUUID();
        UUID applicationId = UUID.randomUUID();
        assertThatThrownBy(() -> new ApplicationCvAccessService(applications, storage)
                .download(recruiterId, applicationId))
                .isInstanceOf(ApplicationNotFoundException.class);
    }

    private static final class RecordingStorage implements ObjectStorage {
        private int downloadRequests;
        @Override public void put(String objectKey, InputStream input, long size, String contentType) { }
        @Override public void delete(String objectKey) { }
        @Override public InputStream openDownload(String objectBucket, String objectKey) {
            downloadRequests++;
            return new ByteArrayInputStream("%PDF-1.7".getBytes());
        }
    }

    private static final class FakeApplications implements ApplicationRepository {
        private final Optional<ApplicationCvSnapshot> snapshot;
        private FakeApplications(Optional<ApplicationCvSnapshot> snapshot) { this.snapshot = snapshot; }
        @Override public Application insert(UUID candidateUserId, UUID jobId, UUID cvId) {
            throw new UnsupportedOperationException();
        }
        @Override public List<Application> findAllForCandidate(UUID candidateUserId) { return List.of(); }
        @Override public Optional<Application> findForCandidate(UUID candidateUserId, UUID applicationId) {
            return Optional.empty();
        }
        @Override public List<Application> findAllForRecruiter(UUID recruiterUserId, UUID jobId) { return List.of(); }
        @Override public Optional<Application> findForRecruiter(UUID recruiterUserId, UUID applicationId) {
            return Optional.empty();
        }
        @Override public Optional<Application> updateStatus(UUID recruiterUserId, UUID applicationId,
                                                           ApplicationStatus status, String reason,
                                                           long expectedVersion) { return Optional.empty(); }
        @Override public Optional<Application> withdraw(UUID candidateUserId, UUID applicationId, String reason,
                                                       long expectedVersion) { return Optional.empty(); }
        @Override public List<ApplicationStatusChange> findHistoryForViewer(UUID viewerUserId, UUID applicationId) {
            return List.of();
        }
        @Override public Optional<ApplicationCvSnapshot> findCvSnapshotForRecruiter(UUID recruiterUserId,
                                                                                   UUID applicationId) {
            return snapshot;
        }
    }
}
