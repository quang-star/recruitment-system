package com.smartrecruitment.core.job.application;

import com.smartrecruitment.core.job.application.port.JobRepository;
import com.smartrecruitment.core.job.domain.Job;
import com.smartrecruitment.core.job.domain.JobStatus;
import com.smartrecruitment.core.job.domain.JobVersion;
import com.smartrecruitment.core.recruiter.application.port.CompanyRepository;
import com.smartrecruitment.core.recruiter.domain.Company;
import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class JobServiceTests {
    @Test
    void createsDraftWithContentHash() {
        FakeJobs jobs = new FakeJobs();
        UUID companyId = UUID.randomUUID();
        JobService service = new JobService(jobs, new AllowCompany());

        Job created = service.create(UUID.randomUUID(), companyId, "Backend", "Description", "Java", null,
                null, "VN", null, null, null, 1, null, null, null, null, false, null);

        assertThat(created.status()).isEqualTo(JobStatus.DRAFT);
        assertThat(created.activeVersion().sourceHash()).hasSize(64);
    }

    @Test
    void cannotEditPublishedJob() {
        FakeJobs jobs = new FakeJobs();
        UUID userId = UUID.randomUUID();
        jobs.job = draft(userId);
        jobs.job = new Job(jobs.job.publicId(), jobs.job.companyId(), userId, JobStatus.PUBLISHED,
                OffsetDateTime.now(), null, 1, jobs.job.activeVersion());
        JobService service = new JobService(jobs, new AllowCompany());

        assertThatThrownBy(() -> service.updateDraft(userId, jobs.job.publicId(), 1, "x", "d", "r", null,
                null, "VN", null, null, null, 1, null, null, null, null, false, null))
                .isInstanceOf(JobStateException.class);
    }

    private static Job draft(UUID userId) {
        JobVersion version = new JobVersion(UUID.randomUUID(), 1, "Title", "Description", "Requirements", null,
                null, "VN", null, null, null, 1, null, null, null, null, false, null, "a".repeat(64), userId);
        return Job.draft(UUID.randomUUID(), userId, version);
    }

    private static final class FakeJobs implements JobRepository {
        private Job job;
        @Override public Job insert(Job value) { job = value; return value; }
        @Override public Optional<Job> findByPublicIdForMember(UUID jobId, UUID userId) { return Optional.ofNullable(job).filter(value -> value.publicId().equals(jobId)); }
        @Override public List<Job> findAllForMember(UUID companyId, UUID userId) { return job == null ? List.of() : List.of(job); }
        @Override public List<Job> findPublished() { return job == null ? List.of() : List.of(job); }
        @Override public Optional<Job> updateDraft(Job value, JobVersion newVersion, long expectedVersion, UUID userId) { return Optional.empty(); }
        @Override public Optional<Job> publish(UUID jobId, UUID userId, long expectedVersion, OffsetDateTime publishedAt) { return Optional.empty(); }
        @Override public Optional<Job> close(UUID jobId, UUID userId, long expectedVersion, OffsetDateTime closedAt) { return Optional.empty(); }
    }

    private static final class AllowCompany implements CompanyRepository {
        @Override public Company insertWithOwner(Company company, UUID ownerUserId) { return company; }
        @Override public Optional<Company> findByPublicIdForMember(UUID companyId, UUID userId) { return Optional.empty(); }
        @Override public List<Company> findAllForMember(UUID userId) { return List.of(); }
        @Override public boolean isActiveMember(UUID companyId, UUID userId) { return true; }
        @Override public boolean canManage(UUID companyId, UUID userId) { return true; }
        @Override public Optional<Company> update(Company company, long expectedVersion) { return Optional.empty(); }
    }
}
