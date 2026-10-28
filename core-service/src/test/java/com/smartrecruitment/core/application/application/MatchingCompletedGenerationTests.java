package com.smartrecruitment.core.application.application;

import com.smartrecruitment.core.application.infrastructure.messaging.MatchingCompletedListener;
import com.smartrecruitment.core.application.infrastructure.persistence.JooqApplicationMatchingProjectionRepository;
import com.smartrecruitment.core.notification.application.NotificationService;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class MatchingCompletedGenerationTests {
    private static final Long ID = com.smartrecruitment.core.support.TestIds.next();
    private static final Long PREVIOUS = com.smartrecruitment.core.support.TestIds.next();

    @Test
    void passesNumberedAndLegacyMetadataToTheNewRepositoryOverload() {
        var repository = mock(JooqApplicationMatchingProjectionRepository.class);
        var notifications = mock(NotificationService.class);
        var listener = new MatchingCompletedListener(repository, new ObjectMapper(), notifications);
        when(repository.update(any(), any(), any(), any(), anyString(), anyDouble(), anyString(), anyString(), anyString(), anyString(), eq(3L), eq(PREVIOUS)))
                .thenReturn(true);
        listener.onMessage(event("\"resultGeneration\":3,\"supersedesMatchingResultId\":\"" + PREVIOUS + "\","));
        verify(repository).update(eq(ID), eq(ID), eq(ID), eq(ID), eq("COMPLETED"), eq(80.0), eq("[]"), anyString(), eq("baseline-v3"), eq("1.0.0"), eq(3L), eq(PREVIOUS));
        verify(notifications).matchingCompleted(ID, ID, 80.0);
        listener.onMessage(event("\"resultGeneration\":null,\"supersedesMatchingResultId\":null,"));
        verify(repository).update(eq(ID), eq(ID), eq(ID), eq(ID), eq("COMPLETED"), eq(80.0), eq("[]"), anyString(), eq("baseline-v3"), eq("1.0.0"), isNull(), isNull());
    }

    @Test
    void rejectsInvalidGenerationsAndSupersedesBeforeWritingOrNotifying() {
        var repository = mock(JooqApplicationMatchingProjectionRepository.class);
        var notifications = mock(NotificationService.class);
        var listener = new MatchingCompletedListener(repository, new ObjectMapper(), notifications);
        for (String invalid : List.of("0", "-1", "1.5", "\"2\"", "true", "9223372036854775808", "{}")) {
            assertThatThrownBy(() -> listener.onMessage(event("\"resultGeneration\":" + invalid + ","))).isInstanceOf(IllegalArgumentException.class);
        }
        for (String invalid : List.of("\"bad-uuid\"", "3", "\"" + ID + "\"")) {
            assertThatThrownBy(() -> listener.onMessage(event("\"supersedesMatchingResultId\":" + invalid + ","))).isInstanceOf(IllegalArgumentException.class);
        }
        verifyNoInteractions(repository, notifications);
    }

    @Test
    void rejectedLateEventsNeverGenerateNotifications() {
        var repository = mock(JooqApplicationMatchingProjectionRepository.class);
        var notifications = mock(NotificationService.class);
        new MatchingCompletedListener(repository, new ObjectMapper(), notifications).onMessage(event("\"resultGeneration\":1,"));
        verify(repository).update(any(), any(), any(), any(), anyString(), anyDouble(), anyString(), anyString(), anyString(), anyString(), eq(1L), isNull());
        verifyNoInteractions(notifications);
    }

    private static String event(String metadata) {
        return """
                {"eventType":"matching.completed.v2","payload":{%s
                  "applicationId":"%s","cvVersionId":"%s","jobVersionId":"%s",
                  "matchingResultId":"%s","status":"COMPLETED","finalScore":80,
                  "algorithmVersion":"baseline-v3","taxonomyVersion":"1.0.0",
                  "qualityFlags":[],"components":[],"claims":[]}}
                """.formatted(metadata, ID, ID, ID, ID);
    }
}
