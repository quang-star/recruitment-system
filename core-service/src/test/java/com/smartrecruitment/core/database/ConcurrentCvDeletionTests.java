package com.smartrecruitment.core.database;

import com.smartrecruitment.core.application.application.ApplicationService;
import com.smartrecruitment.core.application.domain.Application;
import com.smartrecruitment.core.application.infrastructure.persistence.JooqApplicationRepository;
import com.smartrecruitment.core.cv.application.CvPrivacyService;
import com.smartrecruitment.core.cv.domain.CandidateCv;
import com.smartrecruitment.core.cv.domain.CvProcessingStatus;
import com.smartrecruitment.core.cv.domain.CvVersion;
import com.smartrecruitment.core.cv.infrastructure.persistence.JooqCandidateCvRepository;
import com.smartrecruitment.core.cv.infrastructure.persistence.JooqCvPrivacyRepository;
import com.smartrecruitment.core.cv.infrastructure.persistence.JooqOutboxEventRepository;
import com.smartrecruitment.core.job.domain.Job;
import com.smartrecruitment.core.job.domain.JobVersion;
import com.smartrecruitment.core.job.infrastructure.persistence.JooqJobRepository;
import com.smartrecruitment.core.recruiter.domain.Company;
import com.smartrecruitment.core.recruiter.infrastructure.persistence.JooqCompanyRepository;
import org.flywaydb.core.Flyway;
import org.jooq.DSLContext;
import org.jooq.impl.DSL;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;
import tools.jackson.databind.ObjectMapper;

import java.sql.DriverManager;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.ApplicationCvAccessGrants.APPLICATION_CV_ACCESS_GRANTS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.Applications.APPLICATIONS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.CandidateConsents.CANDIDATE_CONSENTS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.CvErasureQueue.CV_ERASURE_QUEUE;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.CvVersions.CV_VERSIONS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.Cvs.CVS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.OutboxEvents.OUTBOX_EVENTS;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;

class ConcurrentCvDeletionTests {
    private static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:17.10-alpine");
    private static final String COVER_LETTER = "Synthetic copied CV details requiring erasure";
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

    @Test
    void deletionHoldingCvLockRejectsWaitingSubmissionWithoutRetainingPrivateData() throws Exception {
        var fixture = fixture();
        var deleted = new CountDownLatch(1);
        var commitDeletion = new CountDownLatch(1);
        var submissionStarted = new CountDownLatch(1);
        var submissionPid = new AtomicInteger();

        try (var executor = Executors.newFixedThreadPool(2)) {
            var deletion = executor.submit(() -> transaction(context -> {
                privacy(context).delete(fixture.candidate(), fixture.cv().publicId(), 0);
                deleted.countDown();
                await(commitDeletion);
                return null;
            }));
            await(deleted);
            var submission = executor.submit(() -> transaction(context -> {
                submissionPid.set(backendPid(context));
                submissionStarted.countDown();
                return apply(context, fixture);
            }));
            try {
                await(submissionStarted);
                awaitDatabaseLock(submissionPid.get());
            } finally {
                commitDeletion.countDown();
            }
            deletion.get(20, TimeUnit.SECONDS);
            assertThatThrownBy(() -> submission.get(20, TimeUnit.SECONDS))
                    .isInstanceOf(ExecutionException.class)
                    .hasCauseInstanceOf(IllegalArgumentException.class)
                    .hasRootCauseMessage("Job must be published and CV must be confirmed");
        }

        assertThat(dsl.fetchCount(APPLICATIONS, APPLICATIONS.CANDIDATE_USER_ID.eq(fixture.candidate()))).isZero();
        assertThat(dsl.fetchCount(APPLICATION_CV_ACCESS_GRANTS, APPLICATION_CV_ACCESS_GRANTS.CV_VERSION_ID.in(
                dsl.select(CV_VERSIONS.ID).from(CV_VERSIONS)
                        .where(CV_VERSIONS.PUBLIC_ID.eq(fixture.cv().activeVersion().publicId()))))).isZero();
        assertThat(dsl.fetchCount(CANDIDATE_CONSENTS, CANDIDATE_CONSENTS.CANDIDATE_USER_ID.eq(fixture.candidate()))).isZero();
        assertThat(dsl.fetchCount(OUTBOX_EVENTS, OUTBOX_EVENTS.CORRELATION_ID.eq(fixture.correlationId()))).isZero();
        assertErased(fixture);
    }

    @Test
    void submissionHoldingCvLockCommitsBeforeDeletionErasesItsLetterAndGrant() throws Exception {
        var fixture = fixture();
        var submitted = new CountDownLatch(1);
        var commitSubmission = new CountDownLatch(1);
        var deletionStarted = new CountDownLatch(1);
        var deletionPid = new AtomicInteger();
        Application application;

        try (var executor = Executors.newFixedThreadPool(2)) {
            var submission = executor.submit(() -> transaction(context -> {
                var created = apply(context, fixture);
                submitted.countDown();
                await(commitSubmission);
                return created;
            }));
            await(submitted);
            var deletion = executor.submit(() -> transaction(context -> {
                deletionPid.set(backendPid(context));
                deletionStarted.countDown();
                privacy(context).delete(fixture.candidate(), fixture.cv().publicId(), 0);
                return null;
            }));
            try {
                await(deletionStarted);
                awaitDatabaseLock(deletionPid.get());
            } finally {
                commitSubmission.countDown();
            }
            application = submission.get(20, TimeUnit.SECONDS);
            deletion.get(20, TimeUnit.SECONDS);
        }

        var row = dsl.selectFrom(APPLICATIONS).where(APPLICATIONS.PUBLIC_ID.eq(application.publicId())).fetchOne();
        assertThat(row).isNotNull();
        assertThat(row.getCoverLetter()).isNull();
        var grants = dsl.selectFrom(APPLICATION_CV_ACCESS_GRANTS)
                .where(APPLICATION_CV_ACCESS_GRANTS.APPLICATION_ID.eq(row.getId())).fetch();
        assertThat(grants).hasSize(1).allMatch(grant -> grant.getRevokedAt() != null);
        assertThat(new JooqApplicationRepository(dsl).findCvSnapshotForRecruiter(fixture.recruiter(), application.publicId()))
                .isEmpty();
        assertThat(dsl.fetchCount(APPLICATIONS, APPLICATIONS.CANDIDATE_USER_ID.eq(fixture.candidate()))).isOne();
        assertThat(dsl.fetchCount(OUTBOX_EVENTS, OUTBOX_EVENTS.AGGREGATE_ID.eq(application.publicId())
                .and(OUTBOX_EVENTS.EVENT_TYPE.eq("application.submitted.v1")))).isOne();
        assertErased(fixture);

        // Existing idempotent replays stay valid even after the CV has been erased.
        var replay = transaction(context -> apply(context, fixture));
        assertThat(replay.publicId()).isEqualTo(application.publicId());
        assertThat(replay.coverLetter()).isNull();
        assertThat(replay.cvAccessGranted()).isFalse();
        assertThat(dsl.fetchCount(APPLICATIONS, APPLICATIONS.CANDIDATE_USER_ID.eq(fixture.candidate()))).isOne();
        assertThat(dsl.fetchCount(OUTBOX_EVENTS, OUTBOX_EVENTS.AGGREGATE_ID.eq(application.publicId()))).isOne();
    }

    @Test
    void deletionPreservesLifecycleOrderWhenStoredApplicationAndGrantTimesAreAheadOfJvm() throws Exception {
        var fixture = fixture();
        var application = transaction(context -> apply(context, fixture));
        var future = OffsetDateTime.now().plusDays(1);
        dsl.update(APPLICATIONS).set(APPLICATIONS.APPLIED_AT, future).set(APPLICATIONS.UPDATED_AT, future)
                .where(APPLICATIONS.PUBLIC_ID.eq(application.publicId())).execute();
        var before = dsl.selectFrom(APPLICATIONS).where(APPLICATIONS.PUBLIC_ID.eq(application.publicId())).fetchOne();
        dsl.update(APPLICATION_CV_ACCESS_GRANTS).set(APPLICATION_CV_ACCESS_GRANTS.GRANTED_AT, future)
                .where(APPLICATION_CV_ACCESS_GRANTS.APPLICATION_ID.eq(before.getId())).execute();

        transaction(context -> {
            privacy(context).delete(fixture.candidate(), fixture.cv().publicId(), 0);
            return null;
        });

        var erased = dsl.selectFrom(APPLICATIONS).where(APPLICATIONS.PUBLIC_ID.eq(application.publicId())).fetchOne();
        assertThat(erased.getUpdatedAt()).isAfterOrEqualTo(before.getUpdatedAt());
        assertThat(erased.getUpdatedAt()).isAfterOrEqualTo(erased.getAppliedAt());
        assertThat(erased.getCoverLetter()).isNull();
        var grant = dsl.selectFrom(APPLICATION_CV_ACCESS_GRANTS)
                .where(APPLICATION_CV_ACCESS_GRANTS.APPLICATION_ID.eq(before.getId())).fetchOne();
        assertThat(grant.getRevokedAt()).isNotNull().isAfterOrEqualTo(grant.getGrantedAt());
        assertErased(fixture);
    }

    private static Application apply(DSLContext context, Fixture fixture) {
        return new ApplicationService(new JooqApplicationRepository(context), outbox(context))
                .apply(fixture.candidate(), fixture.jobId(), fixture.cv().publicId(), fixture.cv().activeVersion().publicId(),
                        COVER_LETTER, true, "cv-sharing-v1", fixture.idempotencyKey(), fixture.correlationId());
    }

    private static CvPrivacyService privacy(DSLContext context) {
        return new CvPrivacyService(new JooqCvPrivacyRepository(context), outbox(context));
    }

    private static JooqOutboxEventRepository outbox(DSLContext context) {
        return new JooqOutboxEventRepository(context, new ObjectMapper());
    }

    private static void assertErased(Fixture fixture) {
        assertThat(dsl.select(CVS.STATUS).from(CVS).where(CVS.PUBLIC_ID.eq(fixture.cv().publicId())).fetchOne(CVS.STATUS))
                .isEqualTo("DELETED");
        assertThat(dsl.fetchCount(CV_ERASURE_QUEUE, CV_ERASURE_QUEUE.CV_VERSION_ID.eq(fixture.cv().activeVersion().publicId())))
                .isOne();
        assertThat(dsl.fetchCount(OUTBOX_EVENTS, OUTBOX_EVENTS.AGGREGATE_ID.eq(fixture.cv().activeVersion().publicId())
                .and(OUTBOX_EVENTS.EVENT_TYPE.eq("cv.deleted.v1")))).isOne();
    }

    private static Fixture fixture() {
        UUID recruiter = UUID.randomUUID(), candidate = UUID.randomUUID();
        var company = new JooqCompanyRepository(dsl).insertWithOwner(Company.create(recruiter,
                "Synthetic Legal", "Synthetic Company", "privacy-" + UUID.randomUUID(),
                null, null, "VN", null, null), recruiter);
        var jobs = new JooqJobRepository(dsl);
        var version = new JobVersion(UUID.randomUUID(), 1, "Synthetic Java job", "Build services", "Java",
                null, null, "VN", null, null, null, 1, null, null, null, null, false, null, "a".repeat(64), recruiter);
        var job = jobs.insert(Job.draft(company.publicId(), recruiter, version));
        jobs.publish(job.publicId(), recruiter, 0, OffsetDateTime.now()).orElseThrow();
        var cvs = new JooqCandidateCvRepository(dsl);
        var cv = cvs.insert(CandidateCv.uploaded(candidate, "Synthetic privacy CV",
                CvVersion.uploaded(UUID.randomUUID(), "fixture", UUID.randomUUID() + ".pdf", "synthetic.pdf",
                        100, "b".repeat(64), candidate)));
        assertThat(cvs.updateProcessingStatus(cv.activeVersion().publicId(), "b".repeat(64),
                CvProcessingStatus.CONFIRMED, null)).isTrue();
        return new Fixture(recruiter, candidate, job.publicId(), cvs.findByPublicId(candidate, cv.publicId()).orElseThrow(),
                UUID.randomUUID().toString(), UUID.randomUUID());
    }

    private static int backendPid(DSLContext context) {
        return context.fetchOne("select pg_backend_pid()").get(0, Integer.class);
    }

    private static void awaitDatabaseLock(int pid) {
        // Observe a real PostgreSQL lock wait, so scheduling speed cannot choose the test ordering.
        assertTimeoutPreemptively(Duration.ofSeconds(20), () -> {
            while (!dsl.fetchOne("select cardinality(pg_blocking_pids(?)) > 0", pid).get(0, Boolean.class)) {
                Thread.sleep(20);
            }
        });
    }

    private static void await(CountDownLatch latch) throws InterruptedException {
        assertThat(latch.await(20, TimeUnit.SECONDS)).as("Transaction synchronization signal").isTrue();
    }

    private static <T> T transaction(TransactionWork<T> work) throws Exception {
        try (var connection = DriverManager.getConnection(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())) {
            connection.setAutoCommit(false);
            try {
                T result = work.run(DSL.using(connection));
                connection.commit();
                return result;
            } catch (Exception exception) {
                connection.rollback();
                throw exception;
            }
        }
    }

    @FunctionalInterface
    private interface TransactionWork<T> {
        T run(DSLContext context) throws Exception;
    }

    private record Fixture(UUID recruiter, UUID candidate, UUID jobId, CandidateCv cv,
                           String idempotencyKey, UUID correlationId) {}
}
