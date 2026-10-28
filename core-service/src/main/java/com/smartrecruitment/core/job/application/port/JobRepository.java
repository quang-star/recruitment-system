package com.smartrecruitment.core.job.application.port;

import com.smartrecruitment.core.job.application.JobSearch;
import com.smartrecruitment.core.job.domain.Job;
import com.smartrecruitment.core.job.domain.JobVersion;
import com.smartrecruitment.core.shared.application.PageResult;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

public interface JobRepository {
    Map<Long, Integer> publishedCountsByCompany();
    PageResult<Job> searchPublished(
            JobSearch search);
    PageResult<Job> searchForMember(Long companyId, Long userId,
            JobSearch search);
    Job insert(Job job);
    Optional<Job> findByIdForMember(Long jobId, Long userId);
    List<Job> findAllForMember(Long companyId, Long userId);
    List<Job> findPublished();
    Optional<Job> updateDraft(Job job, JobVersion newVersion, long expectedVersion, Long userId);
    Optional<Job> publish(Long jobId, Long userId, long expectedVersion, OffsetDateTime publishedAt);
    Optional<Job> close(Long jobId, Long userId, long expectedVersion, OffsetDateTime closedAt);

    /**
     * Implementations backed by the Core database enforce ParsedJD confirmation.
     * The default keeps lightweight in-memory unit-test repositories source-compatible.
     */
    default boolean isParsedJdConfirmed(Long jobVersionId) { return true; }
}
