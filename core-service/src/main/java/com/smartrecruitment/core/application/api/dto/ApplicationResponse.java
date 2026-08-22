package com.smartrecruitment.core.application.api.dto;

import com.smartrecruitment.core.application.domain.Application;

import java.time.OffsetDateTime;
import java.util.UUID;

public record ApplicationResponse(UUID applicationId, UUID candidateUserId, UUID companyId, UUID cvId,
                                  UUID cvVersionId, UUID jobId, UUID jobVersionId, String status, String source,
                                  OffsetDateTime appliedAt, OffsetDateTime updatedAt, long version) {
    public static ApplicationResponse from(Application application) {
        return new ApplicationResponse(application.publicId(), application.candidateUserId(), application.companyId(),
                application.cvId(), application.cvVersionId(), application.jobId(), application.jobVersionId(),
                application.status().name(), application.source().name(), application.appliedAt(),
                application.updatedAt(), application.version());
    }
}
