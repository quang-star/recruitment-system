package com.smartrecruitment.core.cv.domain;

import java.util.Objects;
import java.util.UUID;

public record CvVersion(UUID publicId, int versionNumber, String objectBucket, String objectKey,
                        String originalFilename, String mimeType, long sizeBytes, String sha256,
                        String languageHint, CvProcessingStatus processingStatus, String failureCode,
                        long version) {
    public CvVersion {
        Objects.requireNonNull(publicId, "publicId");
        if (versionNumber < 1) throw new IllegalArgumentException("versionNumber must be positive");
        objectBucket = requireText(objectBucket, "objectBucket", 120);
        objectKey = requireText(objectKey, "objectKey", 600);
        originalFilename = requireText(originalFilename, "originalFilename", 255);
        if (!"application/pdf".equals(mimeType)) throw new IllegalArgumentException("CV must be a PDF");
        if (sizeBytes < 1 || sizeBytes > 10 * 1024 * 1024) {
            throw new IllegalArgumentException("CV size must be between 1 byte and 10 MiB");
        }
        if (sha256 == null || !sha256.matches("[0-9a-f]{64}")) {
            throw new IllegalArgumentException("sha256 must be a lowercase SHA-256 hash");
        }
        Objects.requireNonNull(processingStatus, "processingStatus");
        if (processingStatus == CvProcessingStatus.FAILED && failureCode == null) {
            throw new IllegalArgumentException("failed CV versions require a failure code");
        }
        if (processingStatus != CvProcessingStatus.FAILED && failureCode != null) {
            throw new IllegalArgumentException("only failed CV versions may expose a failure code");
        }
        if (version < 0) throw new IllegalArgumentException("version must not be negative");
    }

    public static CvVersion uploaded(UUID publicId, String objectBucket, String objectKey,
                                     String originalFilename, long sizeBytes, String sha256,
                                     UUID createdByUserId) {
        Objects.requireNonNull(createdByUserId, "createdByUserId");
        return new CvVersion(publicId, 1, objectBucket, objectKey, originalFilename,
                "application/pdf", sizeBytes, sha256, null, CvProcessingStatus.UPLOADED, null, 0);
    }

    private static String requireText(String value, String field, int maxLength) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException(field + " must not be blank");
        String normalized = value.trim();
        if (normalized.length() > maxLength) throw new IllegalArgumentException(field + " is too long");
        return normalized;
    }
}
