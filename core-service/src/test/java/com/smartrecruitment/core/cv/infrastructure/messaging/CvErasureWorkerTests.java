package com.smartrecruitment.core.cv.infrastructure.messaging;

import com.smartrecruitment.core.cv.application.port.CvErasureRepository;
import com.smartrecruitment.core.cv.application.port.CvErasureRepository.PendingErasure;
import com.smartrecruitment.core.cv.application.port.ObjectStorage;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.ArgumentCaptor;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

class CvErasureWorkerTests {
    private final CvErasureRepository erasures = mock(CvErasureRepository.class);
    private final ObjectStorage storage = mock(ObjectStorage.class);
    private final CvErasureWorker worker = new CvErasureWorker(erasures, storage);

    @Test
    void deletesObjectBeforeCompletingErasureUsingBatchTimestamp() {
        var entry = new PendingErasure(UUID.randomUUID(), "synthetic/cv.pdf", 2);
        when(erasures.claimPending(any(), eq(10))).thenReturn(List.of(entry));
        var before = OffsetDateTime.now(ZoneOffset.UTC);

        worker.erasePending();

        var claimedAt = claimTimestamp();
        assertThat(claimedAt).isBetween(before, OffsetDateTime.now(ZoneOffset.UTC));
        assertThat(claimedAt.getOffset()).isEqualTo(ZoneOffset.UTC);
        var ordered = inOrder(storage, erasures);
        ordered.verify(erasures).claimPending(claimedAt, 10);
        ordered.verify(storage).delete(entry.objectKey());
        ordered.verify(erasures).markCompleted(entry.cvVersionId(), claimedAt);
        verify(erasures, never()).scheduleRetry(any(), anyInt(), any());
    }

    @ParameterizedTest
    @CsvSource({"0, 1, 5", "58, 59, 295", "59, 60, 300", "60, 61, 300", "999999, 1000000, 300", "1000000, 1000000, 300"})
    void retriesTemporaryFailureWithCappedAttemptsAndBackoff(int attempts, int expectedAttempts,
                                                           long expectedDelaySeconds) {
        var entry = new PendingErasure(UUID.randomUUID(), "synthetic/retry.pdf", attempts);
        when(erasures.claimPending(any(), eq(10))).thenReturn(List.of(entry));
        doThrow(new IllegalStateException("Temporary storage outage")).when(storage).delete(entry.objectKey());

        worker.erasePending();

        var claimedAt = claimTimestamp();
        verify(erasures).scheduleRetry(entry.cvVersionId(), expectedAttempts,
                claimedAt.plusSeconds(expectedDelaySeconds));
        verify(erasures, never()).markCompleted(any(), any());
    }

    @Test
    void continuesToNextEntryAfterStorageFailure() {
        var failed = new PendingErasure(UUID.randomUUID(), "synthetic/failed.pdf", 0);
        var successful = new PendingErasure(UUID.randomUUID(), "synthetic/success.pdf", 0);
        when(erasures.claimPending(any(), eq(10))).thenReturn(List.of(failed, successful));
        doThrow(new IllegalStateException("Temporary storage outage")).when(storage).delete(failed.objectKey());

        worker.erasePending();

        var claimedAt = claimTimestamp();
        var ordered = inOrder(storage, erasures);
        ordered.verify(erasures).claimPending(claimedAt, 10);
        ordered.verify(storage).delete(failed.objectKey());
        ordered.verify(erasures).scheduleRetry(failed.cvVersionId(), 1, claimedAt.plusSeconds(5));
        ordered.verify(storage).delete(successful.objectKey());
        ordered.verify(erasures).markCompleted(successful.cvVersionId(), claimedAt);
        verify(erasures, never()).markCompleted(eq(failed.cvVersionId()), any());
    }

    @Test
    void emptyBatchDoesNotCallStorageOrUpdateQueue() {
        when(erasures.claimPending(any(), eq(10))).thenReturn(List.of());

        worker.erasePending();

        claimTimestamp();
        verifyNoInteractions(storage);
        verifyNoMoreInteractions(erasures);
    }

    private OffsetDateTime claimTimestamp() {
        var timestamp = ArgumentCaptor.forClass(OffsetDateTime.class);
        verify(erasures).claimPending(timestamp.capture(), eq(10));
        return timestamp.getValue();
    }
}
