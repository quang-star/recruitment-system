package com.smartrecruitment.core.job.application;

import com.smartrecruitment.core.job.domain.Job;

import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.UUID;

public record JobVersionSubmittedEvent(UUID jobId, UUID jobVersionId, UUID recruiterUserId,
                                       String objectRef, String sourceHash, UUID correlationId,
                                       OffsetDateTime occurredAt) {
    public JobVersionSubmittedEvent {
        Objects.requireNonNull(jobId, "jobId");
        Objects.requireNonNull(jobVersionId, "jobVersionId");
        Objects.requireNonNull(recruiterUserId, "recruiterUserId");
        if (objectRef == null || objectRef.isBlank()) throw new IllegalArgumentException("objectRef is required");
        if (sourceHash == null || !sourceHash.matches("[0-9a-f]{64}")) {
            throw new IllegalArgumentException("sourceHash must be a lowercase SHA-256 hash");
        }
        Objects.requireNonNull(correlationId, "correlationId");
        Objects.requireNonNull(occurredAt, "occurredAt");
    }

    public static JobVersionSubmittedEvent from(Job job, String objectRef, UUID correlationId,
                                                OffsetDateTime occurredAt) {
        var version = job.activeVersion();
        return new JobVersionSubmittedEvent(job.publicId(), version.publicId(), version.createdByUserId(),
                objectRef, version.sourceHash(), correlationId, occurredAt);
    }
}

