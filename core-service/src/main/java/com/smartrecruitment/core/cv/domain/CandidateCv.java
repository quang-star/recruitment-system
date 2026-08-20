package com.smartrecruitment.core.cv.domain;

import java.util.Objects;
import java.util.UUID;

public record CandidateCv(UUID publicId, UUID candidateUserId, String title, CvStatus status,
                          CvVersion activeVersion, long version) {
    public CandidateCv {
        Objects.requireNonNull(publicId, "publicId");
        Objects.requireNonNull(candidateUserId, "candidateUserId");
        if (title == null || title.isBlank()) throw new IllegalArgumentException("title must not be blank");
        title = title.trim();
        if (title.length() > 160) throw new IllegalArgumentException("title is too long");
        Objects.requireNonNull(status, "status");
        Objects.requireNonNull(activeVersion, "activeVersion");
        if (version < 0) throw new IllegalArgumentException("version must not be negative");
    }

    public static CandidateCv uploaded(UUID candidateUserId, String title, CvVersion version) {
        return new CandidateCv(UUID.randomUUID(), candidateUserId, title, CvStatus.ACTIVE, version, 0);
    }
}
