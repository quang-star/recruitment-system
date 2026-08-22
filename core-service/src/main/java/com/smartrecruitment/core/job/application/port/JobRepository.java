package com.smartrecruitment.core.job.application.port;

import com.smartrecruitment.core.job.domain.Job;
import com.smartrecruitment.core.job.domain.JobVersion;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface JobRepository {
    Job insert(Job job);
    Optional<Job> findByPublicIdForMember(UUID jobId, UUID userId);
    List<Job> findAllForMember(UUID companyId, UUID userId);
    List<Job> findPublished();
    Optional<Job> updateDraft(Job job, JobVersion newVersion, long expectedVersion, UUID userId);
    Optional<Job> publish(UUID jobId, UUID userId, long expectedVersion, OffsetDateTime publishedAt);
    Optional<Job> close(UUID jobId, UUID userId, long expectedVersion, OffsetDateTime closedAt);
}
