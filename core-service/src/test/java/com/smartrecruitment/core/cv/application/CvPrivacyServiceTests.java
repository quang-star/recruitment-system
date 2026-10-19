package com.smartrecruitment.core.cv.application;

import com.smartrecruitment.core.application.application.ApplicationConflictException;
import com.smartrecruitment.core.cv.application.port.CvPrivacyRepository;
import com.smartrecruitment.core.cv.application.port.CvPrivacyRepository.DeletionState;
import com.smartrecruitment.core.cv.application.port.OutboxEventRepository;
import com.smartrecruitment.core.cv.domain.CvStatus;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

class CvPrivacyServiceTests {
    private final UUID owner = UUID.randomUUID(), cvId = UUID.randomUUID();
    private final CvPrivacyRepository cvs = mock(CvPrivacyRepository.class);
    private final OutboxEventRepository outbox = mock(OutboxEventRepository.class);
    private final CvPrivacyService service = new CvPrivacyService(cvs, outbox);

    @Test
    void missingOrOtherOwnerCannotEraseOrPublishEvents() {
        when(cvs.lockOwned(owner, cvId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.delete(owner, cvId, 0))
                .isInstanceOf(CandidateCvNotFoundException.class);

        verify(cvs, never()).eraseLocked(any(), any());
        verifyNoInteractions(outbox);
    }

    @Test
    void staleVersionCannotEraseOrPublishEvents() {
        when(cvs.lockOwned(owner, cvId)).thenReturn(Optional.of(new DeletionState(CvStatus.ACTIVE, 2)));

        assertThatThrownBy(() -> service.delete(owner, cvId, 1))
                .isInstanceOf(ApplicationConflictException.class);

        verify(cvs, never()).eraseLocked(any(), any());
        verifyNoInteractions(outbox);
    }

    @Test
    void alreadyDeletedRemainsIdempotentWithOriginalVersion() {
        when(cvs.lockOwned(owner, cvId)).thenReturn(Optional.of(new DeletionState(CvStatus.DELETED, 3)));

        service.delete(owner, cvId, 2);

        verify(cvs, never()).eraseLocked(any(), any());
        verifyNoInteractions(outbox);
    }

    @Test
    void publishesMetadataOnlyForEveryErasedVersionWithSameTimestamp() {
        var versions = List.of(UUID.randomUUID(), UUID.randomUUID());
        when(cvs.lockOwned(owner, cvId)).thenReturn(Optional.of(new DeletionState(CvStatus.ACTIVE, 2)));
        when(cvs.eraseLocked(eq(cvId), any())).thenReturn(versions);
        var before = OffsetDateTime.now(ZoneOffset.UTC);

        service.delete(owner, cvId, 2);

        var timestamp = ArgumentCaptor.forClass(OffsetDateTime.class);
        verify(cvs).eraseLocked(eq(cvId), timestamp.capture());
        assertThat(timestamp.getValue()).isBetween(before, OffsetDateTime.now(ZoneOffset.UTC));
        var events = ArgumentCaptor.forClass(PrivacyEvent.class);
        verify(outbox, times(2)).append(events.capture());
        assertThat(events.getAllValues()).extracting(PrivacyEvent::resourceId).containsExactlyElementsOf(versions);
        for (var event : events.getAllValues()) {
            assertThat(event.eventType()).isEqualTo("cv.deleted.v1");
            assertThat(event.payload()).isEqualTo(Map.of("cvId", cvId, "cvVersionId", event.resourceId()));
            assertThat(event.occurredAt()).isEqualTo(timestamp.getValue());
        }
        assertThat(events.getAllValues()).extracting(PrivacyEvent::correlationId).doesNotHaveDuplicates();
    }

    @Test
    void erasureFailureCannotPublishCleanupEvents() {
        when(cvs.lockOwned(owner, cvId)).thenReturn(Optional.of(new DeletionState(CvStatus.ACTIVE, 2)));
        when(cvs.eraseLocked(eq(cvId), any())).thenThrow(new IllegalStateException("Persistence failure"));

        assertThatThrownBy(() -> service.delete(owner, cvId, 2)).isInstanceOf(IllegalStateException.class);

        verifyNoInteractions(outbox);
    }
}
