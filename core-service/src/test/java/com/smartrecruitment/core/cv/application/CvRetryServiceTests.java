package com.smartrecruitment.core.cv.application;

import com.smartrecruitment.core.cv.application.port.CandidateCvRepository;
import com.smartrecruitment.core.cv.application.port.ObjectStorage;
import com.smartrecruitment.core.cv.application.port.OutboxEventRepository;
import com.smartrecruitment.core.cv.domain.CandidateCv;
import com.smartrecruitment.core.cv.domain.CvProcessingStatus;
import com.smartrecruitment.core.cv.domain.CvStatus;
import com.smartrecruitment.core.cv.domain.CvVersion;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;

import java.util.Optional;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class CvRetryServiceTests {
    private final Long owner = com.smartrecruitment.core.support.TestIds.next(), cvId = com.smartrecruitment.core.support.TestIds.next(), versionId = com.smartrecruitment.core.support.TestIds.next();
    private final CandidateCvRepository cvs = mock(CandidateCvRepository.class);
    private final ObjectStorage storage = mock(ObjectStorage.class);
    private final OutboxEventRepository outbox = mock(OutboxEventRepository.class);
    private final CvService service = new CvService(cvs, storage, outbox, "test-bucket");

    private CandidateCv cv(CvProcessingStatus status, String code, long version, long generation) {
        return new CandidateCv(cvId, owner, "Synthetic CV", CvStatus.ACTIVE,
                new CvVersion(versionId, 1, "test-bucket", "private-key.pdf", "cv.pdf", "application/pdf",
                        100, "a".repeat(64), null, status, code, version, generation), 0);
    }

    @Test
    void queuesOwnedTransientFailureUsingSameFileAndNewGeneration() {
        var failed = cv(CvProcessingStatus.FAILED, "SOURCE_STORAGE_UNAVAILABLE", 4, 0);
        var queued = cv(CvProcessingStatus.QUEUED, null, 5, 5);
        when(cvs.findById(owner, cvId)).thenReturn(Optional.of(failed));
        when(cvs.queueRetry(owner, cvId, versionId, 4)).thenReturn(Optional.of(queued));
        assertThat(service.retry(owner, cvId, versionId, 4, java.util.UUID.randomUUID())).isEqualTo(queued);
        var event = ArgumentCaptor.forClass(CvUploadedEvent.class);
        verify(outbox).append(event.capture());
        assertThat(event.getValue().processingGeneration()).isEqualTo(5);
        assertThat(event.getValue().cvVersionId()).isEqualTo(versionId);
        assertThat(event.getValue().objectRef()).isEqualTo("test-bucket/private-key.pdf");
        assertThat(event.getValue().sourceHash()).isEqualTo(failed.activeVersion().sha256());
        verifyNoInteractions(storage);
    }

    @Test
    void repeatedClickReturnsAlreadyQueuedRetryWithoutAnotherEvent() {
        var queued = cv(CvProcessingStatus.QUEUED, null, 5, 5);
        when(cvs.findById(owner, cvId)).thenReturn(Optional.of(queued));
        assertThat(service.retry(owner, cvId, versionId, 4, java.util.UUID.randomUUID())).isEqualTo(queued);
        verifyNoInteractions(outbox, storage);
        verify(cvs, never()).queueRetry(any(), any(), any(), anyLong());
    }

    @Test
    void concurrentClickReturnsWinningQueuedRetryWithoutDuplicateOutbox() {
        var failed = cv(CvProcessingStatus.FAILED, "SOURCE_STORAGE_UNAVAILABLE", 4, 0);
        var queued = cv(CvProcessingStatus.QUEUED, null, 5, 5);
        when(cvs.findById(owner, cvId)).thenReturn(Optional.of(failed), Optional.of(queued));
        when(cvs.queueRetry(owner, cvId, versionId, 4)).thenReturn(Optional.empty());
        assertThat(service.retry(owner, cvId, versionId, 4, java.util.UUID.randomUUID())).isEqualTo(queued);
        verifyNoInteractions(outbox, storage);
    }

    @ParameterizedTest
    @ValueSource(strings = {"CV_PDF_PARSE_FAILED", "SOURCE_OBJECT_NOT_FOUND", "CV_SOURCE_HASH_MISMATCH",
            "SOURCE_STORAGE_ACCESS_DENIED", "SOURCE_STORAGE_READ_FAILED", "SOURCE_OBJECT_REF_INVALID"})
    void rejectsPermanentFailuresWithoutEnqueue(String code) {
        when(cvs.findById(owner, cvId)).thenReturn(Optional.of(cv(CvProcessingStatus.FAILED, code, 4, 0)));
        assertThatThrownBy(() -> service.retry(owner, cvId, versionId, 4, java.util.UUID.randomUUID()))
                .isInstanceOf(CvRetryConflictException.class);
        verifyNoInteractions(outbox, storage);
        verify(cvs, never()).queueRetry(any(), any(), any(), anyLong());
    }

    @Test
    void rejectsStaleSnapshotAndDifferentCvVersion() {
        when(cvs.findById(owner, cvId)).thenReturn(Optional.of(
                cv(CvProcessingStatus.FAILED, "SOURCE_STORAGE_UNAVAILABLE", 4, 0)));
        assertThatThrownBy(() -> service.retry(owner, cvId, versionId, 3, java.util.UUID.randomUUID()))
                .isInstanceOf(CvRetryConflictException.class);
        assertThatThrownBy(() -> service.retry(owner, cvId, com.smartrecruitment.core.support.TestIds.next(), 4, java.util.UUID.randomUUID()))
                .isInstanceOf(CvRetryConflictException.class);
        verifyNoInteractions(outbox, storage);
    }

    @Test
    void cannotRetryCompletedOrProcessingCv() {
        when(cvs.findById(owner, cvId)).thenReturn(Optional.of(cv(CvProcessingStatus.PARSED, null, 4, 0)),
                Optional.of(cv(CvProcessingStatus.PROCESSING, null, 4, 0)));
        for (int i = 0; i < 2; i++) {
            assertThatThrownBy(() -> service.retry(owner, cvId, versionId, 4, java.util.UUID.randomUUID()))
                    .isInstanceOf(CvRetryConflictException.class);
        }
        verifyNoInteractions(outbox, storage);
    }

    @Test
    void otherOwnerGetsNotFoundWithoutAnyWork() {
        var other = com.smartrecruitment.core.support.TestIds.next();
        when(cvs.findById(other, cvId)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.retry(other, cvId, versionId, 4, java.util.UUID.randomUUID()))
                .isInstanceOf(CandidateCvNotFoundException.class);
        verifyNoInteractions(outbox, storage);
    }
}
