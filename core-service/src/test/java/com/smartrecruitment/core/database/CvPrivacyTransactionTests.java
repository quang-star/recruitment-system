package com.smartrecruitment.core.database;

import com.smartrecruitment.core.cv.application.CvPrivacyService;
import com.smartrecruitment.core.cv.application.PrivacyEvent;
import com.smartrecruitment.core.cv.domain.CandidateCv;
import com.smartrecruitment.core.cv.domain.CvVersion;
import com.smartrecruitment.core.cv.infrastructure.persistence.JooqCandidateCvRepository;
import com.smartrecruitment.core.cv.infrastructure.persistence.JooqCvErasureRepository;
import com.smartrecruitment.core.cv.infrastructure.persistence.JooqCvPrivacyRepository;
import com.smartrecruitment.core.cv.infrastructure.persistence.JooqOutboxEventRepository;
import com.smartrecruitment.core.shared.domain.ExternalAiConsent;
import org.flywaydb.core.Flyway;
import org.jooq.DSLContext;
import org.jooq.SQLDialect;
import org.jooq.impl.DSL;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.TransactionAwareDataSourceProxy;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import tools.jackson.databind.ObjectMapper;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.CvErasureQueue.CV_ERASURE_QUEUE;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.CvVersions.CV_VERSIONS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.Cvs.CVS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.OutboxEvents.OUTBOX_EVENTS;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

class CvPrivacyTransactionTests {
    private static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:17.10-alpine");
    private static DSLContext dsl;
    private static DataSourceTransactionManager transactionManager;

    @BeforeAll
    static void start() {
        POSTGRES.start();
        var dataSource = new DriverManagerDataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
        Flyway.configure().dataSource(dataSource).locations("classpath:db/migration").load().migrate();
        transactionManager = new DataSourceTransactionManager(dataSource);
        dsl = DSL.using(new TransactionAwareDataSourceProxy(dataSource), SQLDialect.POSTGRES);
    }

    @AfterAll
    static void stop() {
        POSTGRES.stop();
    }

    @Test
    void secondOutboxFailureRollsBackAllVersionsAndFirstEventThenReplayCommitsOnce() {
        var cv = cvWithTwoVersions();
        var originalCv = dsl.selectFrom(CVS).where(CVS.ID.eq(cv.id())).fetchOne();
        var originalVersions = dsl.selectFrom(CV_VERSIONS).where(CV_VERSIONS.CV_ID.eq(originalCv.getId()))
                .orderBy(CV_VERSIONS.VERSION_NUMBER).fetch();
        var versionIds = originalVersions.map(version -> version.getId());
        var outbox = spy(new JooqOutboxEventRepository(dsl, new ObjectMapper()));
        var writes = new AtomicInteger();
        doAnswer(invocation -> {
            if (writes.incrementAndGet() == 2) {
                assertThat(dsl.fetchCount(OUTBOX_EVENTS, OUTBOX_EVENTS.AGGREGATE_ID.in(versionIds))).isOne();
                throw new IllegalStateException("Synthetic second outbox failure");
            }
            return invocation.callRealMethod();
        }).when(outbox).append(any(PrivacyEvent.class));
        var privacy = transactional(new CvPrivacyService(new JooqCvPrivacyRepository(dsl), outbox));

        assertThatThrownBy(() -> privacy.delete(cv.candidateUserId(), cv.id(), cv.version()))
                .isInstanceOf(IllegalStateException.class).hasMessage("Synthetic second outbox failure");

        assertThat(dsl.selectFrom(CVS).where(CVS.ID.eq(cv.id())).fetchOne().intoMap())
                .isEqualTo(originalCv.intoMap());
        assertThat(dsl.selectFrom(CV_VERSIONS).where(CV_VERSIONS.CV_ID.eq(originalCv.getId()))
                .orderBy(CV_VERSIONS.VERSION_NUMBER).fetch().intoMaps()).isEqualTo(originalVersions.intoMaps());
        assertThat(dsl.fetchCount(CV_ERASURE_QUEUE, CV_ERASURE_QUEUE.CV_VERSION_ID.in(versionIds))).isZero();
        assertThat(dsl.fetchCount(OUTBOX_EVENTS, OUTBOX_EVENTS.AGGREGATE_ID.in(versionIds))).isZero();

        privacy.delete(cv.candidateUserId(), cv.id(), cv.version());
        privacy.delete(cv.candidateUserId(), cv.id(), cv.version());

        var deletedCv = dsl.selectFrom(CVS).where(CVS.ID.eq(cv.id())).fetchOne();
        assertThat(deletedCv.getStatus()).isEqualTo("DELETED");
        assertThat(deletedCv.getTitle()).isEqualTo("CV đã xóa");
        assertThat(deletedCv.getDeletedAt()).isNotNull();
        assertThat(deletedCv.getVersion()).isEqualTo(cv.version() + 1);
        var deletedVersions = dsl.selectFrom(CV_VERSIONS).where(CV_VERSIONS.ID.in(versionIds)).fetch();
        assertThat(deletedVersions).hasSize(2);
        for (var version : deletedVersions) {
            assertThat(version.getProcessingStatus()).isEqualTo("DELETED");
            assertThat(version.getObjectKey()).isEqualTo("deleted/" + version.getId());
            assertThat(version.getOriginalFilename()).isEqualTo("deleted.pdf");
            assertThat(version.getSha256()).isEqualTo("0".repeat(64));
            assertThat(version.getSizeBytes()).isEqualTo(1L);
            assertThat(version.getLanguageHint()).isNull();
            assertThat(version.getConfirmedAt()).isNull();
            assertThat(version.getExternalAiConsent()).isFalse();
            assertThat(version.getExternalAiPolicyVersion()).isNull();
            assertThat(version.getVersion()).isEqualTo(1L);
        }
        var queue = dsl.selectFrom(CV_ERASURE_QUEUE).where(CV_ERASURE_QUEUE.CV_VERSION_ID.in(versionIds)).fetch();
        assertThat(queue).hasSize(2);
        assertThat(queue.map(entry -> entry.getObjectKey()))
                .containsExactlyInAnyOrderElementsOf(originalVersions.map(version -> version.getObjectKey()));
        assertThat(queue).allMatch(entry -> entry.getCompletedAt() == null && entry.getAttempts() == 0);
        var events = dsl.selectFrom(OUTBOX_EVENTS).where(OUTBOX_EVENTS.AGGREGATE_ID.in(versionIds)).fetch();
        assertThat(events).hasSize(2);
        assertThat(events.map(event -> event.getIdempotencyKey())).doesNotHaveDuplicates();
        assertThat(events).allMatch(event -> "cv.deleted.v2".equals(event.getEventType()));
        verify(outbox, times(4)).append(any(PrivacyEvent.class));

        // Complete this fixture's queue so other erasure tests only see their own pending entries.
        var erasures = new JooqCvErasureRepository(dsl);
        versionIds.forEach(versionId -> erasures.markCompleted(versionId, OffsetDateTime.now(ZoneOffset.UTC)));
    }

    @Test
    void deletionHandlesDatabaseTimestampsAheadOfJvmWithoutBreakingMonotonicUpdates() {
        var cv = cvWithTwoVersions();
        var future = OffsetDateTime.now(ZoneOffset.UTC).plusMinutes(5).truncatedTo(ChronoUnit.MICROS);
        var cvRowId = dsl.select(CVS.ID).from(CVS).where(CVS.ID.eq(cv.id())).fetchOne(CVS.ID);
        dsl.update(CVS).set(CVS.CREATED_AT, future).set(CVS.UPDATED_AT, future)
                .where(CVS.ID.eq(cvRowId)).execute();
        dsl.update(CV_VERSIONS).set(CV_VERSIONS.CREATED_AT, future).set(CV_VERSIONS.UPDATED_AT, future)
                .where(CV_VERSIONS.CV_ID.eq(cvRowId)).execute();
        var privacy = transactional(new CvPrivacyService(new JooqCvPrivacyRepository(dsl),
                new JooqOutboxEventRepository(dsl, new ObjectMapper())));

        privacy.delete(cv.candidateUserId(), cv.id(), cv.version());

        var deletedCv = dsl.selectFrom(CVS).where(CVS.ID.eq(cvRowId)).fetchOne();
        assertThat(deletedCv.getStatus()).isEqualTo("DELETED");
        assertThat(deletedCv.getCreatedAt()).isEqualTo(future);
        assertThat(deletedCv.getUpdatedAt()).isAfterOrEqualTo(future);
        var versions = dsl.selectFrom(CV_VERSIONS).where(CV_VERSIONS.CV_ID.eq(cvRowId)).fetch();
        assertThat(versions).hasSize(2);
        for (var version : versions) {
            assertThat(version.getProcessingStatus()).isEqualTo("DELETED");
            assertThat(version.getCreatedAt()).isEqualTo(future);
            assertThat(version.getUpdatedAt()).isAfterOrEqualTo(future);
            assertThat(version.getObjectKey()).isEqualTo("deleted/" + version.getId());
            assertThat(version.getSha256()).isEqualTo("0".repeat(64));
        }
        var versionIds = versions.map(version -> version.getId());
        assertThat(dsl.fetchCount(CV_ERASURE_QUEUE, CV_ERASURE_QUEUE.CV_VERSION_ID.in(versionIds))).isEqualTo(2);
        assertThat(dsl.fetchCount(OUTBOX_EVENTS, OUTBOX_EVENTS.AGGREGATE_ID.in(versionIds))).isEqualTo(2);

        var erasures = new JooqCvErasureRepository(dsl);
        versionIds.forEach(versionId -> erasures.markCompleted(versionId, OffsetDateTime.now(ZoneOffset.UTC)));
    }

    @Test
    void competingTransactionSkipsClaimedRowUntilCompletionCommitsAndScrubsKey() {
        var versionId = com.smartrecruitment.core.support.TestIds.next();
        var now = OffsetDateTime.now(ZoneOffset.UTC).truncatedTo(ChronoUnit.MICROS);
        dsl.insertInto(CV_ERASURE_QUEUE).set(CV_ERASURE_QUEUE.CV_VERSION_ID, versionId)
                .set(CV_ERASURE_QUEUE.OBJECT_KEY, "synthetic/locked-cv.pdf")
                .set(CV_ERASURE_QUEUE.NEXT_ATTEMPT_AT, now.minusYears(1)).execute();
        var erasures = new JooqCvErasureRepository(dsl);
        var transactions = new TransactionTemplate(transactionManager);

        transactions.executeWithoutResult(status -> {
            var claimed = erasures.claimPending(now, 1);
            assertThat(claimed).hasSize(1);
            assertThat(claimed.getFirst().cvVersionId()).isEqualTo(versionId);
            var competing = CompletableFuture.supplyAsync(() -> transactions.execute(
                    competingStatus -> erasures.claimPending(now, 10)));
            assertThat(competing.orTimeout(5, TimeUnit.SECONDS).join())
                    .noneMatch(entry -> entry.cvVersionId().equals(versionId));
            erasures.markCompleted(versionId, now);
        });

        var completed = dsl.selectFrom(CV_ERASURE_QUEUE).where(CV_ERASURE_QUEUE.CV_VERSION_ID.eq(versionId)).fetchOne();
        assertThat(completed.getCompletedAt()).isEqualTo(now);
        assertThat(completed.getObjectKey()).isNull();
        var remaining = transactions.execute(status -> erasures.claimPending(now, 10));
        assertThat(remaining)
                .noneMatch(entry -> entry.cvVersionId().equals(versionId));
    }

    private CandidateCv cvWithTwoVersions() {
        var owner = com.smartrecruitment.core.support.TestIds.next();
        var consent = ExternalAiConsent.fromChoice(true, ExternalAiConsent.POLICY_VERSION);
        var cv = new JooqCandidateCvRepository(dsl).insert(CandidateCv.uploaded(owner, "Synthetic private CV",
                CvVersion.uploaded(com.smartrecruitment.core.support.TestIds.next(), "fixture", com.smartrecruitment.core.support.TestIds.next() + ".pdf", "first.pdf",
                        100, "a".repeat(64), owner, consent)));
        var cvRowId = dsl.select(CVS.ID).from(CVS).where(CVS.ID.eq(cv.id())).fetchOne(CVS.ID);
        dsl.insertInto(CV_VERSIONS).set(CV_VERSIONS.CV_ID, cvRowId)
                .set(CV_VERSIONS.VERSION_NUMBER, 2).set(CV_VERSIONS.OBJECT_BUCKET, "fixture")
                .set(CV_VERSIONS.OBJECT_KEY, com.smartrecruitment.core.support.TestIds.next() + ".pdf").set(CV_VERSIONS.ORIGINAL_FILENAME, "second.pdf")
                .set(CV_VERSIONS.MIME_TYPE, "application/pdf").set(CV_VERSIONS.SIZE_BYTES, 200L)
                .set(CV_VERSIONS.SHA256, "b".repeat(64)).set(CV_VERSIONS.PROCESSING_STATUS, "UPLOADED")
                .set(CV_VERSIONS.CREATED_BY_USER_ID, owner).set(CV_VERSIONS.EXTERNAL_AI_CONSENT, true)
                .set(CV_VERSIONS.EXTERNAL_AI_POLICY_VERSION, consent.policyVersion()).execute();
        dsl.update(CV_VERSIONS).set(CV_VERSIONS.LANGUAGE_HINT, "vi")
                .set(CV_VERSIONS.PROCESSING_STATUS, "CONFIRMED")
                .set(CV_VERSIONS.CONFIRMED_AT, OffsetDateTime.now(ZoneOffset.UTC))
                .where(CV_VERSIONS.CV_ID.eq(cvRowId)).execute();
        return cv;
    }

    private CvPrivacyService transactional(CvPrivacyService service) {
        var interceptor = new TransactionInterceptor();
        interceptor.setTransactionManager(transactionManager);
        interceptor.setTransactionAttributeSource(new AnnotationTransactionAttributeSource());
        var proxyFactory = new ProxyFactory(service);
        proxyFactory.addAdvice(interceptor);
        return (CvPrivacyService) proxyFactory.getProxy();
    }
}
