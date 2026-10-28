package com.smartrecruitment.core.cv.application;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

/** Metadata-only erasure commands use existing resource topics, without embedding CV content. */
public record PrivacyEvent(String eventType, Long resourceId, Map<String, Object> payload,
                           UUID correlationId, OffsetDateTime occurredAt) {
    public PrivacyEvent {
        if (!java.util.List.of("cv.deleted.v2", "application.cv-access.revoked.v2").contains(eventType)) {
            throw new IllegalArgumentException("Unsupported privacy event");
        }
        java.util.Objects.requireNonNull(resourceId);
        java.util.Objects.requireNonNull(correlationId);
        java.util.Objects.requireNonNull(occurredAt);
        payload = Map.copyOf(payload);
    }
    public static PrivacyEvent revoked(Long applicationId) {
        return new PrivacyEvent("application.cv-access.revoked.v2", applicationId,
                Map.of("applicationId", applicationId.toString()), UUID.randomUUID(), OffsetDateTime.now());
    }
}
