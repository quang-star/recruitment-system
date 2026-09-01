package com.smartrecruitment.core.job.application;

import com.smartrecruitment.core.application.application.ApplicationSubmittedEvent;
import com.smartrecruitment.core.cv.application.CvUploadedEvent;
import com.smartrecruitment.core.cv.application.port.ObjectStorage;
import com.smartrecruitment.core.cv.application.port.OutboxEventRepository;
import com.smartrecruitment.core.job.application.port.JobRepository;
import com.smartrecruitment.core.job.domain.Job;
import com.smartrecruitment.core.job.domain.JobStatus;
import com.smartrecruitment.core.job.domain.JobVersion;
import com.smartrecruitment.core.recruiter.application.port.CompanyRepository;
import com.smartrecruitment.core.recruiter.domain.Company;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.io.InputStream;
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

    @Test
    void storesPrivateSnapshotAndPublishesReferenceOnly() throws Exception {
        FakeJobs jobs = new FakeJobs();
        RecordingStorage storage = new RecordingStorage();
        RecordingOutbox outbox = new RecordingOutbox(false);
        ObjectMapper mapper = JsonMapper.builder().build();
        UUID userId = UUID.randomUUID();
        UUID companyId = UUID.randomUUID();
        UUID correlationId = UUID.randomUUID();
        JobService service = new JobService(jobs, new AllowCompany(), storage, outbox, mapper, "private-jd");

        Job created = service.create(userId, companyId, "Backend Engineer", "Build internal APIs",
                "Java and Kafka", null, null, "VN", null, null, null, 1,
                null, null, null, null, false, null, correlationId);

        assertThat(storage.objectKey).isEqualTo("jobs/" + created.publicId() + "/"
                + created.activeVersion().publicId() + ".json");
        assertThat(storage.contentType).isEqualTo("application/json");
        var snapshot = mapper.readTree(storage.content);
        assertThat(snapshot.get("title").asText()).isEqualTo("Backend Engineer");
        assertThat(snapshot.get("description").asText()).isEqualTo("Build internal APIs");
        assertThat(snapshot.get("requirementsText").asText()).isEqualTo("Java and Kafka");
        assertThat(snapshot.get("sourceHash").asText()).isEqualTo(created.activeVersion().sourceHash());
        assertThat(outbox.event.jobId()).isEqualTo(created.publicId());
        assertThat(outbox.event.jobVersionId()).isEqualTo(created.activeVersion().publicId());
        assertThat(outbox.event.recruiterUserId()).isEqualTo(userId);
        assertThat(outbox.event.objectRef()).isEqualTo("private-jd/" + storage.objectKey);
        assertThat(outbox.event.sourceHash()).isEqualTo(created.activeVersion().sourceHash());
        assertThat(outbox.event.correlationId()).isEqualTo(correlationId);
    }

    @Test
    void removesPrivateSnapshotWhenOutboxAppendFails() {
        FakeJobs jobs = new FakeJobs();
        RecordingStorage storage = new RecordingStorage();
        RecordingOutbox outbox = new RecordingOutbox(true);
        JobService service = new JobService(jobs, new AllowCompany(), storage, outbox,
                JsonMapper.builder().build(), "private-jd");

        assertThatThrownBy(() -> service.create(UUID.randomUUID(), UUID.randomUUID(), "Backend", "Description",
                "Java", null, null, "VN", null, null, null, 1,
                null, null, null, null, false, null, UUID.randomUUID()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("outbox unavailable");
        assertThat(storage.deletedKey).isEqualTo(storage.objectKey);
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

    private static final class RecordingStorage implements ObjectStorage {
        private String objectKey;
        private byte[] content;
        private String contentType;
        private String deletedKey;

        @Override
        public void put(String objectKey, InputStream input, long size, String contentType) {
            try {
                this.objectKey = objectKey;
                this.content = input.readAllBytes();
                this.contentType = contentType;
                assertThat(this.content).hasSize((int) size);
            } catch (IOException exception) {
                throw new IllegalStateException(exception);
            }
        }

        @Override
        public void delete(String objectKey) {
            deletedKey = objectKey;
        }
    }

    private static final class RecordingOutbox implements OutboxEventRepository {
        private final boolean fail;
        private JobVersionSubmittedEvent event;

        private RecordingOutbox(boolean fail) {
            this.fail = fail;
        }

        @Override
        public void append(CvUploadedEvent event) { }

        @Override
        public void append(ApplicationSubmittedEvent event) { }

        @Override
        public void append(JobVersionSubmittedEvent event) {
            if (fail) throw new IllegalStateException("outbox unavailable");
            this.event = event;
        }
    }
}
