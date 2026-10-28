package com.smartrecruitment.core.application.application;

import com.smartrecruitment.core.application.application.port.ApplicationRepository;
import com.smartrecruitment.core.application.domain.ApplicationCvSnapshot;
import com.smartrecruitment.core.application.domain.Application;
import com.smartrecruitment.core.application.domain.ApplicationStatus;
import com.smartrecruitment.core.application.domain.ApplicationStatusChange;
import com.smartrecruitment.core.cv.application.port.ObjectStorage;
import org.junit.jupiter.api.Test;

import java.util.Optional;
import java.util.List;
import java.io.InputStream;
import java.io.ByteArrayInputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ApplicationCvAccessServiceTests {
    @Test
    void createsShortLivedDownloadForAuthorizedSnapshot() {
        Long recruiterId = com.smartrecruitment.core.support.TestIds.next();
        Long applicationId = com.smartrecruitment.core.support.TestIds.next();
        Long cvVersionId = com.smartrecruitment.core.support.TestIds.next();
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
        Long recruiterId = com.smartrecruitment.core.support.TestIds.next();
        Long applicationId = com.smartrecruitment.core.support.TestIds.next();
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
        public com.smartrecruitment.core.shared.application.PageResult<Application> searchForCandidate(Long userId,
                com.smartrecruitment.core.application.application.ApplicationSearch search) {
            throw new UnsupportedOperationException("Paging is covered by repository integration tests");
        }
        public com.smartrecruitment.core.shared.application.PageResult<Application> searchForRecruiter(Long userId, Long jobId,
                com.smartrecruitment.core.application.application.ApplicationSearch search) {
            throw new UnsupportedOperationException("Paging is covered by repository integration tests");
        }

        private final Optional<ApplicationCvSnapshot> snapshot;
        private FakeApplications(Optional<ApplicationCvSnapshot> snapshot) { this.snapshot = snapshot; }
        @Override public Application insert(Long candidateUserId, Long jobId, Long cvId) {
            throw new UnsupportedOperationException();
        }
        @Override public List<Application> findAllForCandidate(Long candidateUserId) { return List.of(); }
        @Override public Optional<Application> findForCandidate(Long candidateUserId, Long applicationId) {
            return Optional.empty();
        }
        @Override public List<Application> findAllForRecruiter(Long recruiterUserId, Long jobId) { return List.of(); }
        @Override public Optional<Application> findForRecruiter(Long recruiterUserId, Long applicationId) {
            return Optional.empty();
        }
        @Override public Optional<Application> updateStatus(Long recruiterUserId, Long applicationId,
                                                           ApplicationStatus status, String reason,
                                                           long expectedVersion) { return Optional.empty(); }
        @Override public Optional<Application> withdraw(Long candidateUserId, Long applicationId, String reason,
                                                       long expectedVersion) { return Optional.empty(); }
        @Override public List<ApplicationStatusChange> findHistoryForViewer(Long viewerUserId, Long applicationId) {
            return List.of();
        }
        @Override public Optional<ApplicationCvSnapshot> findCvSnapshotForRecruiter(Long recruiterUserId,
                                                                                   Long applicationId) {
            return snapshot;
        }
    }
}
