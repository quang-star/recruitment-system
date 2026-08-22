package com.smartrecruitment.core.application.domain;

import java.time.OffsetDateTime;
import java.util.UUID;

public record Application(UUID publicId, UUID candidateUserId, UUID companyId, UUID cvId, UUID cvVersionId,
                          UUID jobId, UUID jobVersionId, ApplicationStatus status, ApplicationSource source,
                          OffsetDateTime appliedAt, OffsetDateTime updatedAt, long version) {
    public Application {
        if (publicId == null || candidateUserId == null || companyId == null || cvId == null || cvVersionId == null
                || jobId == null || jobVersionId == null) throw new IllegalArgumentException("Application snapshot is required");
        if (status == null || source == null || appliedAt == null || updatedAt == null) throw new IllegalArgumentException("Application state is required");
        if (version < 0 || updatedAt.isBefore(appliedAt)) throw new IllegalArgumentException("Invalid application version or timestamps");
    }
}
