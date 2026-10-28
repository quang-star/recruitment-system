package com.smartrecruitment.core.application.domain;

import java.time.OffsetDateTime;

public record Application(Long id, Long candidateUserId, Long companyId, Long cvId, Long cvVersionId,
                          Long jobId, Long jobVersionId, String coverLetter,
                          ApplicationStatus status, ApplicationSource source,
                          OffsetDateTime appliedAt, OffsetDateTime updatedAt, long version, boolean matchingSupported, boolean cvAccessGranted) {
    public Application(Long id, Long candidateUserId, Long companyId, Long cvId, Long cvVersionId,
                          Long jobId, Long jobVersionId, String coverLetter,
                          ApplicationStatus status, ApplicationSource source,
                          OffsetDateTime appliedAt, OffsetDateTime updatedAt, long version) {
        this(id, candidateUserId, companyId, cvId, cvVersionId, jobId, jobVersionId, coverLetter, status, source, appliedAt, updatedAt, version, true, true);
    }

    public Application(Long id, Long candidateUserId, Long companyId, Long cvId, Long cvVersionId,
                          Long jobId, Long jobVersionId, String coverLetter,
                          ApplicationStatus status, ApplicationSource source,
                          OffsetDateTime appliedAt, OffsetDateTime updatedAt, long version, boolean matchingSupported) {
        this(id, candidateUserId, companyId, cvId, cvVersionId, jobId, jobVersionId, coverLetter, status, source, appliedAt, updatedAt, version, matchingSupported, true);
    }

    public Application {
        if (id == null || candidateUserId == null || companyId == null || cvId == null || cvVersionId == null
                || jobId == null || jobVersionId == null) throw new IllegalArgumentException("Application snapshot is required");
        if (coverLetter != null) {
            coverLetter = coverLetter.trim();
            if (coverLetter.isEmpty()) coverLetter = null;
            if (coverLetter != null && coverLetter.length() > 5000) {
                throw new IllegalArgumentException("Cover letter must not exceed 5000 characters");
            }
        }
        if (status == null || source == null || appliedAt == null || updatedAt == null) throw new IllegalArgumentException("Application state is required");
        if (version < 0 || updatedAt.isBefore(appliedAt)) throw new IllegalArgumentException("Invalid application version or timestamps");
    }
}
