package com.smartrecruitment.core.job.domain;

import java.time.OffsetDateTime;
import java.util.UUID;

public record Job(UUID publicId, UUID companyId, UUID createdByUserId, JobStatus status,
                  OffsetDateTime publishedAt, OffsetDateTime closedAt, long version,
                  JobVersion activeVersion) {
    public Job {
        if (publicId == null || companyId == null || createdByUserId == null || activeVersion == null) {
            throw new IllegalArgumentException("Job identity and active version are required");
        }
        if (version < 0) throw new IllegalArgumentException("version must be non-negative");
    }

    public static Job draft(UUID companyId, UUID createdByUserId, JobVersion firstVersion) {
        return new Job(UUID.randomUUID(), companyId, createdByUserId, JobStatus.DRAFT, null, null, 0, firstVersion);
    }
}
