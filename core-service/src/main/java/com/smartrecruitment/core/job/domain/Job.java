package com.smartrecruitment.core.job.domain;

import java.time.OffsetDateTime;

public record Job(Long id, Long companyId, Long createdByUserId, JobStatus status,
                  OffsetDateTime publishedAt, OffsetDateTime closedAt, long version,
                  JobVersion activeVersion) {
    public Job {
        if (id == null || companyId == null || createdByUserId == null || activeVersion == null) {
            throw new IllegalArgumentException("Job identity and active version are required");
        }
        if (version < 0) throw new IllegalArgumentException("version must be non-negative");
    }

    public static Job draft(Long companyId, Long createdByUserId, JobVersion firstVersion) {
        return new Job(0L, companyId, createdByUserId, JobStatus.DRAFT, null, null, 0, firstVersion);
    }
}
