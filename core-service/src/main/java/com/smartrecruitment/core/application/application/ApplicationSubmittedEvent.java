package com.smartrecruitment.core.application.application;

import com.smartrecruitment.core.application.domain.Application;

import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.UUID;

public record ApplicationSubmittedEvent(Long applicationId, Long cvVersionId, Long jobVersionId,
                                        UUID correlationId, OffsetDateTime occurredAt) {
    public ApplicationSubmittedEvent {
        Objects.requireNonNull(applicationId, "applicationId");
        Objects.requireNonNull(cvVersionId, "cvVersionId");
        Objects.requireNonNull(jobVersionId, "jobVersionId");
        Objects.requireNonNull(correlationId, "correlationId");
        Objects.requireNonNull(occurredAt, "occurredAt");
    }

    public static ApplicationSubmittedEvent from(Application application, UUID correlationId) {
        return new ApplicationSubmittedEvent(application.id(), application.cvVersionId(),
                application.jobVersionId(), correlationId, OffsetDateTime.now());
    }
}
