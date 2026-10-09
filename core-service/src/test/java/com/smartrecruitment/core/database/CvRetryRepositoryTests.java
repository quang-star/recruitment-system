package com.smartrecruitment.core.database;

import com.smartrecruitment.core.cv.application.CvService;
import com.smartrecruitment.core.cv.application.CvUploadedEvent;
import com.smartrecruitment.core.cv.application.port.ObjectStorage;
import com.smartrecruitment.core.cv.domain.CandidateCv;
import com.smartrecruitment.core.cv.domain.CvVersion;
import com.smartrecruitment.core.cv.domain.CvProcessingStatus;
import com.smartrecruitment.core.cv.infrastructure.persistence.JooqCandidateCvRepository;
import com.smartrecruitment.core.cv.infrastructure.persistence.JooqOutboxEventRepository;
import org.flywaydb.core.Flyway;
import org.jooq.DSLContext;
import org.jooq.impl.DSL;
import org.junit.jupiter.api.*;
import org.testcontainers.containers.PostgreSQLContainer;
import tools.jackson.databind.ObjectMapper;

import java.time.OffsetDateTime;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.OutboxEvents.OUTBOX_EVENTS;

class CvRetryRepositoryTests {
    private static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:17.10-alpine");
    private static DSLContext dsl;

    @BeforeAll
    static void start() {
        POSTGRES.start();
        Flyway.configure().dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .locations("classpath:db/migration").load().migrate();
        dsl = DSL.using(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
    }

    @AfterAll
    static void stop() { POSTGRES.stop(); }

    private CandidateCv failed(JooqCandidateCvRepository repository) {
        UUID owner = UUID.randomUUID();
        var cv = repository.insert(CandidateCv.uploaded(owner, "Synthetic CV",
                CvVersion.uploaded(UUID.randomUUID(), "test-bucket", UUID.randomUUID() + ".pdf", "cv.pdf",
                        100, "a".repeat(64), owner)));
        assertThat(repository.updateProcessingAttemptStatus(cv.activeVersion().publicId(), "a".repeat(64),
                CvProcessingStatus.FAILED, "SOURCE_STORAGE_UNAVAILABLE", 0)).isTrue();
        return repository.findByPublicId(owner, cv.publicId()).orElseThrow();
    }

    @Test
    void concurrentRetriesHaveOneWinnerAndOldResultsCannotOverwriteIt() {
        var repository = new JooqCandidateCvRepository(dsl);
        var cv = failed(repository);
        var version = cv.activeVersion();
        var first = CompletableFuture.supplyAsync(() -> repository.queueRetry(cv.candidateUserId(), cv.publicId(),
                version.publicId(), version.version()));
        var second = CompletableFuture.supplyAsync(() -> repository.queueRetry(cv.candidateUserId(), cv.publicId(),
                version.publicId(), version.version()));
        assertThat((first.join().isPresent() ? 1 : 0) + (second.join().isPresent() ? 1 : 0)).isEqualTo(1);
        var queued = repository.findByPublicId(cv.candidateUserId(), cv.publicId()).orElseThrow();
        long generation = queued.activeVersion().processingGeneration();
        assertThat(generation).isEqualTo(version.version() + 1);
        assertThat(repository.updateProcessingAttemptStatus(version.publicId(), version.sha256(),
                CvProcessingStatus.FAILED, "SOURCE_STORAGE_UNAVAILABLE", 0)).isFalse();
        assertThat(repository.updateProcessingAttemptStatus(version.publicId(), version.sha256(),
                CvProcessingStatus.PARSED, null, 0)).isFalse();
        assertThat(repository.findByPublicId(cv.candidateUserId(), cv.publicId()).orElseThrow()
                .activeVersion().processingStatus()).isEqualTo(CvProcessingStatus.QUEUED);
        assertThat(repository.updateProcessingAttemptStatus(version.publicId(), version.sha256(),
                CvProcessingStatus.PARSED, null, generation)).isTrue();
        assertThat(repository.updateProcessingAttemptStatus(version.publicId(), version.sha256(),
                CvProcessingStatus.FAILED, "SOURCE_STORAGE_UNAVAILABLE", generation)).isFalse();
        assertThat(repository.updateProcessingStatus(version.publicId(), version.sha256(),
                CvProcessingStatus.CONFIRMED, null)).isTrue();
        assertThat(repository.updateProcessingAttemptStatus(version.publicId(), version.sha256(),
                CvProcessingStatus.PARSED, null, generation)).isFalse();
    }

    @Test
    void wrongOwnerAndWrongVersionCannotQueueRetry() {
        var repository = new JooqCandidateCvRepository(dsl);
        var cv = failed(repository);
        assertThat(repository.queueRetry(UUID.randomUUID(), cv.publicId(), cv.activeVersion().publicId(), 1)).isEmpty();
        assertThat(repository.queueRetry(cv.candidateUserId(), cv.publicId(), UUID.randomUUID(), 1)).isEmpty();
        assertThat(repository.queueRetry(cv.candidateUserId(), cv.publicId(), cv.activeVersion().publicId(), 0)).isEmpty();
        assertThat(repository.findByPublicId(cv.candidateUserId(), cv.publicId()).orElseThrow().activeVersion()
                .processingStatus()).isEqualTo(CvProcessingStatus.FAILED);
    }

    @Test
    void failedOutboxWriteRollsBackQueuedRetry() {
        var repository = new JooqCandidateCvRepository(dsl);
        var cv = failed(repository);
        assertThatThrownBy(() -> dsl.transaction(configuration -> {
            var transactional = new JooqCandidateCvRepository(DSL.using(configuration));
            var service = new CvService(transactional, mock(ObjectStorage.class),
                    event -> { throw new IllegalStateException("synthetic outbox failure"); }, "test-bucket");
            service.retry(cv.candidateUserId(), cv.publicId(), cv.activeVersion().publicId(), 1, UUID.randomUUID());
        })).isInstanceOf(RuntimeException.class);
        var after = repository.findByPublicId(cv.candidateUserId(), cv.publicId()).orElseThrow().activeVersion();
        assertThat(after.processingStatus()).isEqualTo(CvProcessingStatus.FAILED);
        assertThat(after.processingGeneration()).isZero();
        assertThat(after.version()).isEqualTo(1);
    }

    @Test
    void uploadAndRetryPublishDistinctKeysUsingSamePrivateObject() {
        var repository = new JooqCandidateCvRepository(dsl);
        var cv = failed(repository);
        var outbox = new JooqOutboxEventRepository(dsl, new ObjectMapper());
        outbox.append(CvUploadedEvent.from(cv, UUID.randomUUID(), OffsetDateTime.now()));
        var queued = repository.queueRetry(cv.candidateUserId(), cv.publicId(), cv.activeVersion().publicId(), 1).orElseThrow();
        outbox.append(CvUploadedEvent.from(queued, UUID.randomUUID(), OffsetDateTime.now()));
        var rows = dsl.selectFrom(OUTBOX_EVENTS).where(OUTBOX_EVENTS.AGGREGATE_ID.eq(cv.publicId())).fetch();
        assertThat(rows).hasSize(2);
        assertThat(rows.get(0).getIdempotencyKey()).isNotEqualTo(rows.get(1).getIdempotencyKey());
        assertThat(rows.get(0).getPayload().data()).contains(cv.activeVersion().objectKey());
        assertThat(rows.get(1).getPayload().data()).contains(cv.activeVersion().objectKey());
        assertThat(new ObjectMapper().readTree(rows.get(1).getPayload().data()).path("processingGeneration").asLong())
                .isEqualTo(2);
    }
}
