package com.smartrecruitment.core.application.domain;

import java.util.Objects;
import java.util.UUID;

public record ApplicationCvSnapshot(UUID cvVersionId, String objectBucket, String objectKey,
                                    String originalFilename, long sizeBytes) {
    public ApplicationCvSnapshot {
        Objects.requireNonNull(cvVersionId, "cvVersionId");
        if (objectBucket == null || objectBucket.isBlank() || objectKey == null || objectKey.isBlank()) {
            throw new IllegalArgumentException("CV object reference is required");
        }
        if (originalFilename == null || originalFilename.isBlank()) {
            throw new IllegalArgumentException("CV filename is required");
        }
        if (sizeBytes < 1) throw new IllegalArgumentException("CV size must be positive");
    }
}
