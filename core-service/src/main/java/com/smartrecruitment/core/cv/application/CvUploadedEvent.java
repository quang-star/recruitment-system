package com.smartrecruitment.core.cv.application;

import com.smartrecruitment.core.cv.domain.CandidateCv;

import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.UUID;

public record CvUploadedEvent(UUID cvId, UUID cvVersionId, UUID candidateUserId, String objectRef, String sourceHash,
                              UUID correlationId, OffsetDateTime occurredAt) {
    public CvUploadedEvent {
        Objects.requireNonNull(cvId, "cvId");
        Objects.requireNonNull(cvVersionId, "cvVersionId");
        Objects.requireNonNull(candidateUserId, "candidateUserId");
        if (objectRef == null || objectRef.isBlank()) throw new IllegalArgumentException("objectRef must not be blank");
        if (sourceHash == null || !sourceHash.matches("[0-9a-f]{64}")) {
            throw new IllegalArgumentException("sourceHash must be a lowercase SHA-256 hash");
        }
        Objects.requireNonNull(correlationId, "correlationId");
        Objects.requireNonNull(occurredAt, "occurredAt");
    }

    public static CvUploadedEvent from(CandidateCv cv, UUID correlationId, OffsetDateTime occurredAt) {
        var version = cv.activeVersion();
        return new CvUploadedEvent(cv.publicId(), version.publicId(), cv.candidateUserId(),
                version.objectBucket() + "/" + version.objectKey(), version.sha256(), correlationId, occurredAt);
    }
}
