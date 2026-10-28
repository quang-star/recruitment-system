package com.smartrecruitment.core.database;

import com.smartrecruitment.core.application.application.ApplicationSearch;
import com.smartrecruitment.core.application.domain.ApplicationStatus;
import com.smartrecruitment.core.application.infrastructure.persistence.JooqApplicationRepository;
import com.smartrecruitment.core.cv.infrastructure.persistence.JooqCvErasureRepository;
import com.smartrecruitment.core.cv.infrastructure.persistence.JooqCvPrivacyRepository;
import com.smartrecruitment.core.job.application.JobSearch;
import com.smartrecruitment.core.job.domain.Job;
import com.smartrecruitment.core.job.domain.JobVersion;
import com.smartrecruitment.core.job.domain.WorkMode;
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

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;

import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.Applications.APPLICATIONS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.ApplicationMatchingProjections.APPLICATION_MATCHING_PROJECTIONS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.Cvs.CVS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.CvVersions.CV_VERSIONS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.CompanyMembers.COMPANY_MEMBERS;
import static org.assertj.core.api.Assertions.assertThat;

class RecruitmentSearchTests {
    @Test
    void deletingMultipleCvsAndVersionsPreservesUniqueTombstoneObjectReferences() {
        Long candidate = com.smartrecruitment.core.support.TestIds.next();
        Long first = confirmedCv(candidate), second = confirmedCv(candidate);
        Long cvRow = dsl.select(CVS.ID).from(CVS).where(CVS.ID.eq(first)).fetchOne(CVS.ID);
        dsl.insertInto(CV_VERSIONS).set(CV_VERSIONS.CV_ID, cvRow)
                .set(CV_VERSIONS.VERSION_NUMBER, 2).set(CV_VERSIONS.OBJECT_BUCKET, "fixture")
                .set(CV_VERSIONS.OBJECT_KEY, com.smartrecruitment.core.support.TestIds.next().toString()).set(CV_VERSIONS.ORIGINAL_FILENAME, "synthetic.pdf")
                .set(CV_VERSIONS.MIME_TYPE, "application/pdf").set(CV_VERSIONS.SIZE_BYTES, 100L)
                .set(CV_VERSIONS.SHA256, "a".repeat(64)).set(CV_VERSIONS.PROCESSING_STATUS, "CONFIRMED")
                .set(CV_VERSIONS.CONFIRMED_AT, OffsetDateTime.now(ZoneOffset.UTC))
                .set(CV_VERSIONS.CREATED_BY_USER_ID, candidate).execute();
        var privacy = new com.smartrecruitment.core.cv.application.CvPrivacyService(new JooqCvPrivacyRepository(dsl),
                new com.smartrecruitment.core.cv.infrastructure.persistence.JooqOutboxEventRepository(dsl, new tools.jackson.databind.ObjectMapper()));
        privacy.delete(candidate, first, 0);
        privacy.delete(candidate, second, 0);
        var versions = dsl.selectFrom(CV_VERSIONS).where(CV_VERSIONS.CREATED_BY_USER_ID.eq(candidate)).fetch();
        assertThat(versions).hasSize(3);
        assertThat(versions).allMatch(version -> "DELETED".equals(version.getProcessingStatus()));
        assertThat(versions.map(version -> version.getObjectKey())).doesNotHaveDuplicates();
        assertThat(versions).allMatch(version -> version.getObjectKey().equals("deleted/" + version.getId()));
    }

    @Test
    void categoryFiltersFollowMergedAliasesWithoutChangingPublishedSnapshots() {
        Long owner = com.smartrecruitment.core.support.TestIds.next();
        var company = company(owner);
        var catalog = new com.smartrecruitment.core.catalog.application.CategoryService(
                new com.smartrecruitment.core.catalog.infrastructure.persistence.JooqCategoryRepository(
                        dsl, new tools.jackson.databind.ObjectMapper()));
        var industry = catalog.create(owner, com.smartrecruitment.core.catalog.domain.CategoryKind.INDUSTRY, null, "Synthetic industry " + com.smartrecruitment.core.support.TestIds.next(), "Synthetic test creation", null);
        var group = catalog.create(owner, com.smartrecruitment.core.catalog.domain.CategoryKind.SPECIALIZATION, industry.id(), "Synthetic group", "Synthetic test creation", null);
        var position = catalog.create(owner, com.smartrecruitment.core.catalog.domain.CategoryKind.POSITION, group.id(), "Synthetic old position", "Synthetic test creation", null);
        var target = catalog.create(owner, com.smartrecruitment.core.catalog.domain.CategoryKind.POSITION, group.id(), "Synthetic target position", "Synthetic test creation", null);
        var classification = new com.smartrecruitment.core.job.domain.JobCategorySnapshot(industry.id(), industry.name(),
                group.id(), group.name(), position.id(), position.name(), com.smartrecruitment.core.job.domain.JobCategorySnapshot.MatchingDomain.OUTSIDE_IT);
        var version = new JobVersion(com.smartrecruitment.core.support.TestIds.next(), 1, "Catalog fixture", "Synthetic description", "Synthetic requirements", null,
                null, "VN", WorkMode.REMOTE, null, null, 1, null, null, null, null, false, null, "c".repeat(64), owner,
                com.smartrecruitment.core.shared.domain.ExternalAiConsent.declined(), classification);
        var jobs = new JooqJobRepository(dsl);
        var job = jobs.insert(Job.draft(company.id(), owner, version));
        jobs.publish(job.id(), owner, 0, OffsetDateTime.now(ZoneOffset.UTC)).orElseThrow();
        var before = new JobSearch(0, 1, "", "newest", company.id(), null, null, null, null, null,
                industry.id(), group.id(), position.id());
        assertThat(jobs.searchPublished(before).items().getFirst().id()).isEqualTo(job.id());
        catalog.act(owner, position.id(), 0, "MERGE", null, target.id(), "Synthetic duplicate merge", null);
        var after = new JobSearch(0, 1, "", "newest", company.id(), null, null, null, null, null,
                industry.id(), group.id(), target.id());
        assertThat(jobs.searchPublished(after).items().getFirst().activeVersion().category()).isEqualTo(classification);
        assertThat(jobs.searchPublished(new JobSearch(0, 1, industry.name(), "newest", company.id(), null,
                null, null, null, null)).total()).isOne();
        assertThat(jobs.searchPublished(new JobSearch(0, 1, "", "newest", company.id(), null,
                null, null, null, null, com.smartrecruitment.core.support.TestIds.next(), null, null)).total()).isZero();
    }

    @Test
    void revokeWithdrawAndEraseSuppressDownloadsScoresAndLateEvents() {
        Long owner = com.smartrecruitment.core.support.TestIds.next(), candidate = com.smartrecruitment.core.support.TestIds.next();
        var company = company(owner);
        var firstJob = job(new JooqJobRepository(dsl), company, owner, "Privacy job", null, true);
        var secondJob = job(new JooqJobRepository(dsl), company, owner, "Privacy second", null, true);
        var cv = confirmedCv(candidate);
        var applications = new JooqApplicationRepository(dsl);
        var first = applications.insert(candidate, firstJob.id(), cv);
        var second = applications.insert(candidate, secondJob.id(), cv);
        var projections = new com.smartrecruitment.core.application.infrastructure.persistence.JooqApplicationMatchingProjectionRepository(dsl);
        assertThat(projections.update(first.id(), first.cvVersionId(), first.jobVersionId(), com.smartrecruitment.core.support.TestIds.next(),
                "COMPLETED", 85, "[]", "{}", "baseline-v5", "1.0.0")).isTrue();
        assertThat(applications.findCvSnapshotForRecruiter(owner, first.id())).isPresent();
        assertThat(applications.revokeCvAccess(com.smartrecruitment.core.support.TestIds.next(), first.id(), 0)).isFalse();
        assertThat(applications.revokeCvAccess(candidate, first.id(), 99)).isFalse();
        assertThat(applications.revokeCvAccess(candidate, first.id(), 0)).isTrue();
        assertThat(applications.revokeCvAccess(candidate, first.id(), 0)).isTrue();
        assertThat(applications.findForCandidate(candidate, first.id()).orElseThrow().cvAccessGranted()).isFalse();
        assertThat(applications.findCvSnapshotForRecruiter(owner, first.id())).isEmpty();
        assertThat(projections.findForViewer(first.id(), owner)).isEmpty();
        assertThat(projections.update(first.id(), first.cvVersionId(), first.jobVersionId(), com.smartrecruitment.core.support.TestIds.next(),
                "COMPLETED", 99, "[]", "{}", "baseline-v5", "1.0.0")).isFalse();
        assertThat(applications.findCvSnapshotForRecruiter(owner, second.id())).isPresent();
        applications.withdraw(candidate, second.id(), "Changed plans", 0).orElseThrow();
        assertThat(applications.findCvSnapshotForRecruiter(owner, second.id())).isEmpty();
        var outbox = new com.smartrecruitment.core.cv.infrastructure.persistence.JooqOutboxEventRepository(dsl,
                new tools.jackson.databind.ObjectMapper());
        var privacy = new com.smartrecruitment.core.cv.application.CvPrivacyService(new JooqCvPrivacyRepository(dsl), outbox);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> privacy.delete(com.smartrecruitment.core.support.TestIds.next(), cv, 0))
                .isInstanceOf(com.smartrecruitment.core.cv.application.CandidateCvNotFoundException.class);
        privacy.delete(candidate, cv, 0);
        privacy.delete(candidate, cv, 0);
        var erasedHistory = applications.findHistoryForViewer(candidate, second.id());
        assertThat(erasedHistory).isNotEmpty();
        assertThat(erasedHistory).noneMatch(change -> "Changed plans".equals(change.reason()));
        var cvRepository = new com.smartrecruitment.core.cv.infrastructure.persistence.JooqCandidateCvRepository(dsl);
        assertThat(cvRepository.findById(candidate, cv)).isEmpty();
        assertThat(cvRepository.updateProcessingStatus(first.cvVersionId(), "b".repeat(64),
                com.smartrecruitment.core.cv.domain.CvProcessingStatus.CONFIRMED, null)).isFalse();
        assertThat(applications.findForCandidate(candidate, first.id())).isPresent();
        var queue = com.smartrecruitment.core.infrastructure.jooq.generated.tables.CvErasureQueue.CV_ERASURE_QUEUE;
        var storage = org.mockito.Mockito.mock(com.smartrecruitment.core.cv.application.port.ObjectStorage.class);
        // Make this resource due regardless of a small JVM/PostgreSQL clock skew.
        dsl.update(queue).set(queue.NEXT_ATTEMPT_AT, OffsetDateTime.now(ZoneOffset.UTC).minusMinutes(1))
                .where(queue.CV_VERSION_ID.eq(first.cvVersionId())).execute();
        String objectKey = dsl.selectFrom(queue).where(queue.CV_VERSION_ID.eq(first.cvVersionId())).fetchOne().getObjectKey();
        org.mockito.Mockito.doThrow(new IllegalStateException("temporary outage")).doNothing().when(storage).delete(objectKey);
        var worker = new com.smartrecruitment.core.cv.infrastructure.messaging.CvErasureWorker(new JooqCvErasureRepository(dsl), storage);
        worker.erasePending();
        var retrying = dsl.selectFrom(queue).where(queue.CV_VERSION_ID.eq(first.cvVersionId())).fetchOne();
        assertThat(retrying.getCompletedAt()).isNull();
        assertThat(retrying.getAttempts()).isEqualTo(1);
        assertThat(retrying.getObjectKey()).isEqualTo(objectKey);
        org.mockito.Mockito.verify(storage).delete(objectKey);
        dsl.update(queue).set(queue.NEXT_ATTEMPT_AT, OffsetDateTime.now(ZoneOffset.UTC).minusMinutes(1))
                .where(queue.CV_VERSION_ID.eq(first.cvVersionId())).execute();
        worker.erasePending();
        var erased = dsl.selectFrom(queue).where(queue.CV_VERSION_ID.eq(first.cvVersionId())).fetchOne();
        assertThat(erased.getCompletedAt()).isNotNull();
        assertThat(erased.getObjectKey()).isNull();
    }
    @Test
    void jobConsentBelongsToVersionAndIsCarriedInSubmissionEvent() {
        Long owner = com.smartrecruitment.core.support.TestIds.next();
        var company = company(owner);
        var repository = new JooqJobRepository(dsl);
        var consent = com.smartrecruitment.core.shared.domain.ExternalAiConsent.fromChoice(true,
                com.smartrecruitment.core.shared.domain.ExternalAiConsent.POLICY_VERSION);
        var first = new JobVersion(com.smartrecruitment.core.support.TestIds.next(), 1, "Backend", "Build services", "Java", null, null,
                "VN", null, null, null, 1, null, null, null, null, false, null, "a".repeat(64), owner, consent);
        var saved = repository.insert(Job.draft(company.id(), owner, first));
        assertThat(repository.findByIdForMember(saved.id(), owner).orElseThrow()
                .activeVersion().externalAiConsent()).isEqualTo(consent);
        var outbox = new com.smartrecruitment.core.cv.infrastructure.persistence.JooqOutboxEventRepository(
                dsl, new tools.jackson.databind.ObjectMapper());
        outbox.append(com.smartrecruitment.core.job.application.JobVersionSubmittedEvent.from(
                saved, "private/snapshot", java.util.UUID.randomUUID(), OffsetDateTime.now()));
        var row = dsl.selectFrom(com.smartrecruitment.core.infrastructure.jooq.generated.tables.OutboxEvents.OUTBOX_EVENTS)
                .where(com.smartrecruitment.core.infrastructure.jooq.generated.tables.OutboxEvents.OUTBOX_EVENTS.AGGREGATE_ID.eq(saved.id()))
                .fetchOne();
        var payload = new tools.jackson.databind.ObjectMapper().readTree(row.getPayload().data());
        assertThat(payload.path("externalAiConsent").asBoolean()).isTrue();
        var second = new JobVersion(com.smartrecruitment.core.support.TestIds.next(), 2, "Backend", "Build services", "Java", null, null,
                "VN", null, null, null, 1, null, null, null, null, false, null, "a".repeat(64), owner);
        var updated = repository.updateDraft(saved, second, saved.version(), owner).orElseThrow();
        assertThat(updated.activeVersion().externalAiConsent().granted()).isFalse();
        assertThat(dsl.selectFrom(com.smartrecruitment.core.infrastructure.jooq.generated.tables.JobVersions.JOB_VERSIONS)
                .where(com.smartrecruitment.core.infrastructure.jooq.generated.tables.JobVersions.JOB_VERSIONS.ID.eq(saved.activeVersion().id()))
                .fetchOne().getExternalAiConsent()).isTrue();
    }
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

    @Test
    void jobPagesFilterBeforePagingRemainStableAndRespectMembershipAndDeadline() {
        Long owner = com.smartrecruitment.core.support.TestIds.next();
        Company company = company(owner);
        var jobs = new JooqJobRepository(dsl);
        for (int i = 0; i < 5; i++) job(jobs, company, owner, "Java " + i, null, true);
        job(jobs, company, owner, "Java expired", OffsetDateTime.now().minusDays(1), true);
        job(jobs, company, owner, "Java draft", null, false);
        job(jobs, company, owner, "React 100%", null, true, "React");
        var first = jobs.searchPublished(search(company.id(), 0, "Java", "newest"));
        var second = jobs.searchPublished(search(company.id(), 1, "Java", "newest"));
        assertThat(first.total()).isEqualTo(5);
        assertThat(first.items()).hasSize(2);
        assertThat(second.items()).hasSize(2).doesNotContainAnyElementsOf(first.items());
        assertThat(jobs.searchPublished(search(company.id(), 0, "Java", "newest")).items()).isEqualTo(first.items());
        assertThat(jobs.searchPublished(search(company.id(), 8, "Java", "newest")).total()).isEqualTo(5);
        assertThat(jobs.searchPublished(search(company.id(), 8, "Java", "newest")).items()).isEmpty();
        assertThat(jobs.searchPublished(search(company.id(), 0, "%", "title")).items())
                .extracting(item -> item.activeVersion().title()).containsExactly("React 100%");
        assertThat(jobs.searchPublished(search(company.id(), 0, "ha noi", "title")).total()).isEqualTo(6);
        assertThat(jobs.searchPublished(new JobSearch(0, 2, "", "newest", company.id(), null,
                "Ha Noi", WorkMode.REMOTE, "Junior|Intern", null)).total()).isEqualTo(6);
        assertThat(jobs.searchForMember(company.id(), com.smartrecruitment.core.support.TestIds.next(), search(null, 0, "", "newest")).total()).isZero();
        assertThat(jobs.searchForMember(company.id(), owner, search(null, 0, "", "newest")).total()).isEqualTo(8);
        assertThat(jobs.publishedCountsByCompany().get(company.id())).isEqualTo(6);
        dsl.update(COMPANY_MEMBERS).set(COMPANY_MEMBERS.STATUS, "SUSPENDED")
                .where(COMPANY_MEMBERS.USER_ID.eq(owner)).execute();
        assertThat(jobs.searchForMember(company.id(), owner, search(null, 0, "", "newest")).total()).isZero();
    }

    @Test
    void applicationsSortGloballyByScoreAndKeepOwnerTenantAndStatusFilters() {
        Long owner = com.smartrecruitment.core.support.TestIds.next();
        var company = company(owner);
        var job = job(new JooqJobRepository(dsl), company, owner, "Backend Java", null, true);
        var repository = new JooqApplicationRepository(dsl);
        var created = new ArrayList<com.smartrecruitment.core.application.domain.Application>();
        for (int i = 0; i < 3; i++) {
            Long candidate = com.smartrecruitment.core.support.TestIds.next();
            Long cv = confirmedCv(candidate);
            var application = repository.insert(candidate, job.id(), cv);
            created.add(application);
            if (i < 2) dsl.insertInto(APPLICATION_MATCHING_PROJECTIONS)
                    .set(APPLICATION_MATCHING_PROJECTIONS.APPLICATION_ID, application.id())
                    .set(APPLICATION_MATCHING_PROJECTIONS.CV_VERSION_ID, application.cvVersionId())
                    .set(APPLICATION_MATCHING_PROJECTIONS.JOB_VERSION_ID, application.jobVersionId())
                    .set(APPLICATION_MATCHING_PROJECTIONS.MATCHING_RESULT_ID, com.smartrecruitment.core.support.TestIds.next())
                    .set(APPLICATION_MATCHING_PROJECTIONS.STATUS, "COMPLETED")
                    .set(APPLICATION_MATCHING_PROJECTIONS.FINAL_SCORE, BigDecimal.valueOf(i == 0 ? 40 : 95)).execute();
        }
        var first = repository.searchForRecruiter(owner, job.id(), new ApplicationSearch(0, 1, "", "score", null));
        assertThat(first.total()).isEqualTo(3);
        assertThat(first.items().getFirst().id()).isEqualTo(created.get(1).id());
        assertThat(repository.searchForRecruiter(owner, job.id(), new ApplicationSearch(1, 1, "", "score", null))
                .items().getFirst().id()).isEqualTo(created.get(0).id());
        assertThat(repository.searchForRecruiter(owner, job.id(), new ApplicationSearch(2, 1, "", "score", null))
                .items().getFirst().id()).isEqualTo(created.get(2).id());
        assertThat(repository.searchForRecruiter(com.smartrecruitment.core.support.TestIds.next(), job.id(), new ApplicationSearch(0, 1, "", "score", null)).total()).isZero();
        assertThat(repository.searchForCandidate(created.getFirst().candidateUserId(), new ApplicationSearch(0, 1, "Java", "newest", null)).total()).isOne();
        assertThat(repository.searchForCandidate(com.smartrecruitment.core.support.TestIds.next(), new ApplicationSearch(0, 1, "", "newest", null)).total()).isZero();
        dsl.update(APPLICATIONS).set(APPLICATIONS.STATUS, "REJECTED")
                .where(APPLICATIONS.ID.eq(created.getFirst().id())).execute();
        assertThat(repository.searchForRecruiter(owner, job.id(), new ApplicationSearch(0, 1, "Java", "score", ApplicationStatus.REJECTED)).total()).isOne();
        assertThat(repository.searchForRecruiter(owner, job.id(), new ApplicationSearch(0, 1, "%", "newest", null)).total()).isZero();
    }

    private static Company company(Long owner) {
        return new JooqCompanyRepository(dsl).insertWithOwner(Company.create(owner, "Search Legal", "Search Company",
                "search-" + com.smartrecruitment.core.support.TestIds.next(), null, null, "VN", null, null), owner);
    }

    private static Job job(JooqJobRepository repository, Company company, Long owner, String title,
                           OffsetDateTime deadline, boolean published) {
        return job(repository, company, owner, title, deadline, published, "Java");
    }

    private static Job job(JooqJobRepository repository, Company company, Long owner, String title,
                           OffsetDateTime deadline, boolean published, String requirements) {
        var version = new JobVersion(com.smartrecruitment.core.support.TestIds.next(), 1, title, "Build services", requirements, null, "Hà Nội", "VN",
                WorkMode.REMOTE, null, "Junior", 1, null, null, null, null, false, deadline, "a".repeat(64), owner);
        var job = repository.insert(Job.draft(company.id(), owner, version));
        return published ? repository.publish(job.id(), owner, 0, OffsetDateTime.parse("2026-01-01T00:00:00Z")).orElseThrow() : job;
    }

    private static JobSearch search(Long company, int page, String q, String sort) {
        return new JobSearch(page, 2, q, sort, company, null, null, null, null, null);
    }

    private static Long confirmedCv(Long candidate) {
        var cv = dsl.insertInto(CVS).set(CVS.CANDIDATE_USER_ID, candidate)
                .set(CVS.TITLE, "Fixture CV").returning().fetchOne();
        var version = dsl.insertInto(CV_VERSIONS)
                .set(CV_VERSIONS.CV_ID, cv.getId()).set(CV_VERSIONS.VERSION_NUMBER, 1)
                .set(CV_VERSIONS.OBJECT_BUCKET, "fixture").set(CV_VERSIONS.OBJECT_KEY, com.smartrecruitment.core.support.TestIds.next().toString())
                .set(CV_VERSIONS.ORIGINAL_FILENAME, "fixture.pdf").set(CV_VERSIONS.MIME_TYPE, "application/pdf")
                .set(CV_VERSIONS.SIZE_BYTES, 100L).set(CV_VERSIONS.SHA256, "b".repeat(64))
                .set(CV_VERSIONS.PROCESSING_STATUS, "CONFIRMED").set(CV_VERSIONS.CONFIRMED_AT, OffsetDateTime.now(ZoneOffset.UTC))
                .set(CV_VERSIONS.CREATED_BY_USER_ID, candidate).returning().fetchOne();
        dsl.update(CVS).set(CVS.ACTIVE_VERSION_ID, version.getId()).where(CVS.ID.eq(cv.getId())).execute();
        return cv.getId();
    }
}
