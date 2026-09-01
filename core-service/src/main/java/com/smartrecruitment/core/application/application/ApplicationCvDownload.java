package com.smartrecruitment.core.application.application;

import java.io.InputStream;
import java.util.Objects;
import java.util.UUID;

public record ApplicationCvDownload(UUID cvVersionId, String originalFilename, long sizeBytes,
                                    InputStream content) {
    public ApplicationCvDownload {
        Objects.requireNonNull(cvVersionId, "cvVersionId");
        Objects.requireNonNull(originalFilename, "originalFilename");
        Objects.requireNonNull(content, "content");
        if (sizeBytes < 1) throw new IllegalArgumentException("CV size must be positive");
    }
}

