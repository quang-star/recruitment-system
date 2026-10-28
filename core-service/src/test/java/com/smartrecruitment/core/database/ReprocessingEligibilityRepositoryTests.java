package com.smartrecruitment.core.database;

import com.smartrecruitment.core.application.domain.Application;
import com.smartrecruitment.core.application.infrastructure.persistence.JooqApplicationRepository;
import com.smartrecruitment.core.application.infrastructure.persistence.JooqApplicationMatchingProjectionRepository;
import com.smartrecruitment.core.cv.domain.CandidateCv;
import com.smartrecruitment.core.cv.domain.CvVersion;
import com.smartrecruitment.core.cv.infrastructure.persistence.JooqCandidateCvRepository;
import com.smartrecruitment.core.job.domain.Job;
import com.smartrecruitment.core.job.domain.JobVersion;
import com.smartrecruitment.core.job.infrastructure.persistence.JooqJobRepository;
import com.smartrecruitment.core.recruiter.domain.Company;
import com.smartrecruitment.core.recruiter.infrastructure.persistence.JooqCompanyRepository;
import com.smartrecruitment.core.reprocessing.application.ReprocessingEligibilityCheck;
import com.smartrecruitment.core.reprocessing.infrastructure.persistence.JooqReprocessingEligibilityRepository;
import org.flywaydb.core.Flyway;
import org.jooq.DSLContext;
import org.jooq.SQLDialect;
import org.jooq.impl.DSL;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.TransactionAwareDataSourceProxy;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.ApplicationCvAccessGrants.APPLICATION_CV_ACCESS_GRANTS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.ApplicationMatchingProjections.APPLICATION_MATCHING_PROJECTIONS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.Applications.APPLICATIONS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.CandidateConsents.CANDIDATE_CONSENTS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.Companies.COMPANIES;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.CompanyMembers.COMPANY_MEMBERS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.CvVersions.CV_VERSIONS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.Cvs.CVS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.JobVersions.JOB_VERSIONS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.Jobs.JOBS;
import static com.smartrecruitment.core.reprocessing.application.ReprocessingEligibilityCheck.Operation.*;
import static com.smartrecruitment.core.reprocessing.application.port.ReprocessingEligibilityRepository.Reason.*;
import static org.assertj.core.api.Assertions.*;

class ReprocessingEligibilityRepositoryTests {
    private static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:17.10-alpine");
    private static DSLContext dsl;
    private static TransactionTemplate transactions;

    @BeforeAll
    static void start() {
        POSTGRES.start();
        var source = new DriverManagerDataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
        Flyway.configure().dataSource(source).locations("classpath:db/migration").load().migrate();
        transactions = new TransactionTemplate(new DataSourceTransactionManager(source));
        dsl = DSL.using(new TransactionAwareDataSourceProxy(source), SQLDialect.POSTGRES);
    }

    @AfterAll
    static void stop() { POSTGRES.stop(); }

    @Test
    void parseChecksExpectedOwnerHashAndActiveCvVersionWithoutReturningDocumentData() {
        var fixture = fixture();
        var repository = new JooqReprocessingEligibilityRepository(dsl);
        var check = parseCv(fixture, fixture.cv().candidateUserId(), "b".repeat(64));
        assertThat(repository.check(check)).isEqualTo(LIVE);
        assertThat(repository.check(parseCv(fixture, com.smartrecruitment.core.support.TestIds.next(), "b".repeat(64)))).isEqualTo(SOURCE_CHANGED);
        assertThat(repository.check(parseCv(fixture, fixture.cv().candidateUserId(), "c".repeat(64)))).isEqualTo(SOURCE_CHANGED);
        assertThat(repository.check(new ReprocessingEligibilityCheck(PARSE_CV, com.smartrecruitment.core.support.TestIds.next(), fixture.owner(), "b".repeat(64), null, null)))
                .isEqualTo(SOURCE_NOT_AVAILABLE);
        dsl.update(CVS).set(CVS.ACTIVE_VERSION_ID, (Long) null).where(CVS.ID.eq(fixture.cv().id())).execute();
        assertThat(repository.check(check)).isEqualTo(SOURCE_CHANGED);
        dsl.update(CVS).set(CVS.STATUS, "DELETED").set(CVS.DELETED_AT, OffsetDateTime.now(ZoneOffset.UTC))
                .where(CVS.ID.eq(fixture.cv().id())).execute();
        assertThat(repository.check(check)).isEqualTo(SOURCE_NOT_AVAILABLE);
    }

    @Test
    void jdChecksVersionCreatorHashActiveVersionDomainAndClosedLifecycle() {
        var fixture = fixture();
        var repository = new JooqReprocessingEligibilityRepository(dsl);
        var check = parseJd(fixture, fixture.owner(), "a".repeat(64));
        assertThat(repository.check(check)).isEqualTo(LIVE);
        assertThat(repository.check(parseJd(fixture, com.smartrecruitment.core.support.TestIds.next(), "a".repeat(64)))).isEqualTo(SOURCE_CHANGED);
        assertThat(repository.check(parseJd(fixture, fixture.owner(), "b".repeat(64)))).isEqualTo(SOURCE_CHANGED);
        dsl.update(JOB_VERSIONS).set(JOB_VERSIONS.MATCHING_DOMAIN, "OUTSIDE_IT")
                .where(JOB_VERSIONS.ID.eq(fixture.application().jobVersionId())).execute();
        assertThat(repository.check(check)).isEqualTo(OUTSIDE_IT);
        dsl.update(JOBS).set(JOBS.STATUS, "CLOSED").set(JOBS.CLOSED_AT, OffsetDateTime.now(ZoneOffset.UTC))
                .where(JOBS.ID.eq(fixture.job().id())).execute();
        assertThat(repository.check(check)).isEqualTo(SOURCE_NOT_AVAILABLE);
    }

    @Test
    void jdAdmissionRequiresActiveRecruitingMembershipAndPreservesPendingCompanyDraftsAndSnapshots() {
        var fixture = fixture();
        var repository = new JooqReprocessingEligibilityRepository(dsl);
        var check = parseJd(fixture, fixture.owner(), "a".repeat(64));
        dsl.update(JOBS).set(JOBS.STATUS, "DRAFT").set(JOBS.PUBLISHED_AT, (OffsetDateTime) null)
                .where(JOBS.ID.eq(fixture.job().id())).execute();
        var sourceBefore = dsl.selectFrom(JOB_VERSIONS).where(JOB_VERSIONS.ID.eq(check.resourceId())).fetchOne().intoMap();
        var jobBefore = dsl.selectFrom(JOBS).where(JOBS.ID.eq(fixture.job().id())).fetchOne().intoMap();
        var member = dsl.selectFrom(COMPANY_MEMBERS).where(COMPANY_MEMBERS.USER_ID.eq(fixture.owner())).fetchOne();
        assertThat(repository.check(check)).isEqualTo(LIVE);
        for (String role : new String[]{"OWNER", "COMPANY_ADMIN", "RECRUITER"}) {
            dsl.update(COMPANY_MEMBERS).set(COMPANY_MEMBERS.ROLE, role).where(COMPANY_MEMBERS.ID.eq(member.getId())).execute();
            assertThat(repository.check(check)).isEqualTo(LIVE);
        }
        dsl.update(COMPANY_MEMBERS).set(COMPANY_MEMBERS.ROLE, "VIEWER").where(COMPANY_MEMBERS.ID.eq(member.getId())).execute();
        assertThat(repository.check(check)).isEqualTo(ACCESS_REVOKED);
        dsl.update(COMPANY_MEMBERS).set(COMPANY_MEMBERS.ROLE, "RECRUITER").set(COMPANY_MEMBERS.STATUS, "SUSPENDED")
                .where(COMPANY_MEMBERS.ID.eq(member.getId())).execute();
        assertThat(repository.check(check)).isEqualTo(ACCESS_REVOKED);
        dsl.update(COMPANY_MEMBERS).set(COMPANY_MEMBERS.STATUS, "LEFT").set(COMPANY_MEMBERS.LEFT_AT, OffsetDateTime.now(ZoneOffset.UTC))
                .where(COMPANY_MEMBERS.ID.eq(member.getId())).execute();
        assertThat(repository.check(check)).isEqualTo(ACCESS_REVOKED);
        dsl.deleteFrom(COMPANY_MEMBERS).where(COMPANY_MEMBERS.ID.eq(member.getId())).execute();
        assertThat(repository.check(check)).isEqualTo(ACCESS_REVOKED);
        assertThat(repository.check(matching(fixture))).isEqualTo(LIVE);
        // Restore only the isolated test membership to verify that rights are checked afresh.
        dsl.insertInto(COMPANY_MEMBERS)
                .set(COMPANY_MEMBERS.COMPANY_ID, member.getCompanyId()).set(COMPANY_MEMBERS.USER_ID, fixture.owner())
                .set(COMPANY_MEMBERS.ROLE, "RECRUITER").set(COMPANY_MEMBERS.STATUS, "ACTIVE").execute();
        assertThat(repository.check(check)).isEqualTo(LIVE);
        dsl.update(COMPANIES).set(COMPANIES.STATUS, "PENDING").where(COMPANIES.ID.eq(member.getCompanyId())).execute();
        assertThat(repository.check(check)).isEqualTo(LIVE);
        assertThat(repository.check(matching(fixture))).isEqualTo(LIVE);
        assertThat(repository.check(check)).isEqualTo(LIVE);
        assertThat(dsl.selectFrom(JOB_VERSIONS).where(JOB_VERSIONS.ID.eq(check.resourceId())).fetchOne().intoMap()).isEqualTo(sourceBefore);
        assertThat(dsl.selectFrom(JOBS).where(JOBS.ID.eq(fixture.job().id())).fetchOne().intoMap()).isEqualTo(jobBefore);
    }

    @Test
    void matchingUsesImmutableSnapshotsAndRejectsChangedOutsideItOrWithdrawnSources() {
        var fixture = fixture();
        var repository = new JooqReprocessingEligibilityRepository(dsl);
        var check = matching(fixture);
        assertThat(repository.check(check)).isEqualTo(LIVE);
        assertThat(repository.check(new ReprocessingEligibilityCheck(MATCH_APPLICATION, fixture.application().id(), null, null,
                com.smartrecruitment.core.support.TestIds.next(), fixture.application().jobVersionId()))).isEqualTo(SOURCE_CHANGED);
        // A newer active source must not change the immutable application snapshot.
        dsl.update(CVS).set(CVS.ACTIVE_VERSION_ID, (Long) null).where(CVS.ID.eq(fixture.cv().id())).execute();
        dsl.update(JOBS).set(JOBS.ACTIVE_VERSION_ID, (Long) null).where(JOBS.ID.eq(fixture.job().id())).execute();
        assertThat(repository.check(check)).isEqualTo(LIVE);
        dsl.update(JOB_VERSIONS).set(JOB_VERSIONS.MATCHING_DOMAIN, "OUTSIDE_IT")
                .where(JOB_VERSIONS.ID.eq(fixture.application().jobVersionId())).execute();
        assertThat(repository.check(check)).isEqualTo(OUTSIDE_IT);
        dsl.update(APPLICATIONS).set(APPLICATIONS.STATUS, "WITHDRAWN")
                .where(APPLICATIONS.ID.eq(fixture.application().id())).execute();
        assertThat(repository.check(check)).isEqualTo(ACCESS_REVOKED);
    }

    @Test
    void matchingRechecksApplicationGrantCandidateConsentAndErasure() {
        var fixture = fixture();
        var repository = new JooqReprocessingEligibilityRepository(dsl);
        var check = matching(fixture);
        var grant = dsl.selectFrom(APPLICATION_CV_ACCESS_GRANTS).where(APPLICATION_CV_ACCESS_GRANTS.APPLICATION_ID.eq(
                dsl.select(APPLICATIONS.ID).from(APPLICATIONS).where(APPLICATIONS.ID.eq(fixture.application().id())))).fetchOne();
        var now = OffsetDateTime.now(ZoneOffset.UTC);
        dsl.update(APPLICATION_CV_ACCESS_GRANTS).set(APPLICATION_CV_ACCESS_GRANTS.REVOKED_AT, now)
                .where(APPLICATION_CV_ACCESS_GRANTS.ID.eq(grant.getId())).execute();
        assertThat(repository.check(check)).isEqualTo(ACCESS_REVOKED);
        dsl.update(APPLICATION_CV_ACCESS_GRANTS).set(APPLICATION_CV_ACCESS_GRANTS.REVOKED_AT, (OffsetDateTime) null)
                .where(APPLICATION_CV_ACCESS_GRANTS.ID.eq(grant.getId())).execute();
        dsl.update(CANDIDATE_CONSENTS).set(CANDIDATE_CONSENTS.REVOKED_AT, now)
                .where(CANDIDATE_CONSENTS.ID.eq(grant.getConsentId())).execute();
        assertThat(repository.check(check)).isEqualTo(ACCESS_REVOKED);
        dsl.update(CANDIDATE_CONSENTS).set(CANDIDATE_CONSENTS.REVOKED_AT, (OffsetDateTime) null)
                .where(CANDIDATE_CONSENTS.ID.eq(grant.getConsentId())).execute();
        assertThat(repository.check(check)).isEqualTo(LIVE);
        dsl.update(CVS).set(CVS.STATUS, "DELETED").set(CVS.DELETED_AT, now)
                .where(CVS.ID.eq(fixture.cv().id())).execute();
        assertThat(repository.check(check)).isEqualTo(SOURCE_NOT_AVAILABLE);
        assertThat(write(fixture, com.smartrecruitment.core.support.TestIds.next(), 5L, 80)).isFalse();
    }

    @Test
    void numberedResultsRejectLowerEqualDifferentAndLateUnnumberedResults() {
        var fixture = fixture();
        Long newer = com.smartrecruitment.core.support.TestIds.next();
        assertThat(write(fixture, newer, 2L, 80)).isTrue();
        var before = projection(fixture).intoMap();
        assertThat(write(fixture, com.smartrecruitment.core.support.TestIds.next(), 1L, 99)).isFalse();
        assertThat(write(fixture, com.smartrecruitment.core.support.TestIds.next(), 2L, 99)).isFalse();
        assertThat(write(fixture, com.smartrecruitment.core.support.TestIds.next(), null, 99)).isFalse();
        assertThat(projection(fixture).intoMap()).isEqualTo(before);
        assertThat(write(fixture, com.smartrecruitment.core.support.TestIds.next(), 3L, 70)).isTrue();
        assertThat(projection(fixture).getResultGeneration()).isEqualTo(3L);
        assertThat(projection(fixture).getFinalScore().doubleValue()).isEqualTo(70);
    }

    @Test
    void legacyNullOrderingRemainsUnknownUntilANumberedResultArrives() {
        var fixture = fixture();
        assertThat(write(fixture, com.smartrecruitment.core.support.TestIds.next(), null, 30)).isTrue();
        assertThat(projection(fixture).getResultGeneration()).isNull();
        assertThat(write(fixture, com.smartrecruitment.core.support.TestIds.next(), null, 40)).isTrue();
        assertThat(write(fixture, com.smartrecruitment.core.support.TestIds.next(), 1L, 50)).isTrue();
        assertThat(write(fixture, com.smartrecruitment.core.support.TestIds.next(), null, 90)).isFalse();
        assertThat(projection(fixture).getResultGeneration()).isEqualTo(1L);
    }

    @Test
    void sameResultReplayCannotChangeMetadataAndIsBlockedAfterAccessRevocation() {
        var fixture = fixture();
        Long result = com.smartrecruitment.core.support.TestIds.next();
        assertThat(write(fixture, result, 4L, 80)).isTrue();
        var before = projection(fixture).intoMap();
        assertThat(write(fixture, result, 4L, 80)).isTrue();
        assertThat(write(fixture, result, 4L, 99)).isFalse();
        assertThat(write(fixture, result, 5L, 80)).isFalse();
        assertThat(write(fixture, result, null, 80)).isFalse();
        assertThat(projection(fixture).intoMap()).isEqualTo(before);
        dsl.update(APPLICATIONS).set(APPLICATIONS.STATUS, "WITHDRAWN")
                .where(APPLICATIONS.ID.eq(fixture.application().id())).execute();
        assertThat(write(fixture, result, 4L, 80)).isFalse();
    }

    @Test
    void replayComparesJsonContentAfterPostgresChangesWhitespaceAndKeyOrder() {
        var fixture = fixture();
        var application = fixture.application();
        Long result = com.smartrecruitment.core.support.TestIds.next();
        var repository = new JooqApplicationMatchingProjectionRepository(dsl);
        assertThat(transactions.<Boolean>execute(status -> repository.update(application.id(), application.cvVersionId(), application.jobVersionId(),
                result, "COMPLETED", 80, "[{\"z\":2,\"a\":1}]", "{\"z\":[2],\"a\":1}", "baseline-v5", "1.0.0", 1L, null))).isTrue();
        var before = projection(fixture).intoMap();
        assertThat(transactions.<Boolean>execute(status -> repository.update(application.id(), application.cvVersionId(), application.jobVersionId(),
                result, "COMPLETED", 80, "[{\"a\":1,\"z\":2}]", "{\"a\":1, \"z\":[2]}", "baseline-v5", "1.0.0", 1L, null))).isTrue();
        assertThat(transactions.<Boolean>execute(status -> repository.update(application.id(), application.cvVersionId(), application.jobVersionId(),
                result, "COMPLETED", 80, "[]", "{\"a\":99}", "baseline-v5", "1.0.0", 1L, null))).isFalse();
        assertThat(projection(fixture).intoMap()).isEqualTo(before);
    }

    private static boolean write(Fixture fixture, Long result, Long generation, double score) {
        var application = fixture.application();
        return transactions.execute(status -> new JooqApplicationMatchingProjectionRepository(dsl).update(application.id(),
                application.cvVersionId(), application.jobVersionId(), result, "COMPLETED", score, "[]", "{}", "baseline-v5", "1.0.0", generation, null));
    }

    private static com.smartrecruitment.core.infrastructure.jooq.generated.tables.records.ApplicationMatchingProjectionsRecord projection(Fixture fixture) {
        return dsl.selectFrom(APPLICATION_MATCHING_PROJECTIONS)
                .where(APPLICATION_MATCHING_PROJECTIONS.APPLICATION_ID.eq(fixture.application().id())).fetchOne();
    }

    private static ReprocessingEligibilityCheck parseCv(Fixture fixture, Long owner, String hash) {
        return new ReprocessingEligibilityCheck(PARSE_CV, fixture.cv().activeVersion().id(), owner, hash, null, null);
    }
    private static ReprocessingEligibilityCheck parseJd(Fixture fixture, Long owner, String hash) {
        return new ReprocessingEligibilityCheck(PARSE_JD, fixture.job().activeVersion().id(), owner, hash, null, null);
    }
    private static ReprocessingEligibilityCheck matching(Fixture fixture) {
        var app = fixture.application();
        return new ReprocessingEligibilityCheck(MATCH_APPLICATION, app.id(), null, null, app.cvVersionId(), app.jobVersionId());
    }

    private static Fixture fixture() {
        Long owner = com.smartrecruitment.core.support.TestIds.next(), candidate = com.smartrecruitment.core.support.TestIds.next();
        var company = new JooqCompanyRepository(dsl).insertWithOwner(Company.create(owner, "Synthetic Legal", "Synthetic Company",
                "reprocess-" + com.smartrecruitment.core.support.TestIds.next(), null, null, "VN", null, null), owner);
        var jobs = new JooqJobRepository(dsl);
        var job = jobs.insert(Job.draft(company.id(), owner, new JobVersion(com.smartrecruitment.core.support.TestIds.next(), 1, "Synthetic Java role",
                "Build Java services", "Java", null, null, "VN", null, null, null, 1, null, null, null, null, false, null, "a".repeat(64), owner)));
        job = jobs.publish(job.id(), owner, 0, OffsetDateTime.now(ZoneOffset.UTC)).orElseThrow();
        var cv = new JooqCandidateCvRepository(dsl).insert(CandidateCv.uploaded(candidate, "Synthetic private CV",
                CvVersion.uploaded(com.smartrecruitment.core.support.TestIds.next(), "fixture", com.smartrecruitment.core.support.TestIds.next() + ".pdf", "fixture.pdf", 100, "b".repeat(64), candidate)));
        dsl.update(CV_VERSIONS).set(CV_VERSIONS.PROCESSING_STATUS, "CONFIRMED").set(CV_VERSIONS.CONFIRMED_AT, OffsetDateTime.now(ZoneOffset.UTC))
                .where(CV_VERSIONS.ID.eq(cv.activeVersion().id())).execute();
        var application = new JooqApplicationRepository(dsl).insert(candidate, job.id(), cv.id());
        return new Fixture(owner, cv, job, application);
    }

    private record Fixture(Long owner, CandidateCv cv, Job job, Application application) { }
}
