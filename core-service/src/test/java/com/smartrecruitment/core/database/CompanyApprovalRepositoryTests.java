package com.smartrecruitment.core.database;

import com.smartrecruitment.core.application.domain.ApplicationStatus;
import com.smartrecruitment.core.application.infrastructure.persistence.JooqApplicationRepository;
import com.smartrecruitment.core.cv.domain.CandidateCv;
import com.smartrecruitment.core.cv.domain.CvProcessingStatus;
import com.smartrecruitment.core.cv.domain.CvVersion;
import com.smartrecruitment.core.cv.infrastructure.persistence.JooqCandidateCvRepository;
import com.smartrecruitment.core.dashboard.infrastructure.persistence.JooqDashboardRepository;
import com.smartrecruitment.core.job.application.JobSearch;
import com.smartrecruitment.core.job.domain.Job;
import com.smartrecruitment.core.job.domain.JobVersion;
import com.smartrecruitment.core.job.infrastructure.persistence.JooqJobRepository;
import com.smartrecruitment.core.recruiter.application.CompanyConflictException;
import com.smartrecruitment.core.recruiter.application.CompanyReviewSearch;
import com.smartrecruitment.core.recruiter.application.CompanyReviewService;
import com.smartrecruitment.core.recruiter.domain.Company;
import com.smartrecruitment.core.recruiter.domain.CompanyStatus;
import com.smartrecruitment.core.recruiter.domain.CompanyVerificationStatus;
import com.smartrecruitment.core.recruiter.infrastructure.persistence.JooqCompanyRepository;
import com.smartrecruitment.core.recruiter.infrastructure.persistence.JooqCompanyReviewRepository;
import com.smartrecruitment.core.support.TestIds;
import org.flywaydb.core.Flyway;
import org.jooq.DSLContext;
import org.jooq.SQLDialect;
import org.jooq.impl.DSL;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.postgresql.ds.PGSimpleDataSource;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.TransactionAwareDataSourceProxy;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;

import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.Companies.COMPANIES;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.Jobs.JOBS;
import static org.assertj.core.api.Assertions.*;

class CompanyApprovalRepositoryTests {
    private static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:17.10-alpine");
    private static DSLContext dsl;
    private static TransactionTemplate transactions;
    private static CompanyReviewService reviews;

    @BeforeAll
    static void start() {
        POSTGRES.start();
        var source = new PGSimpleDataSource();
        source.setURL(POSTGRES.getJdbcUrl());
        source.setUser(POSTGRES.getUsername());
        source.setPassword(POSTGRES.getPassword());
        Flyway.configure().dataSource(source).locations("classpath:db/migration").load().migrate();
        transactions = new TransactionTemplate(new DataSourceTransactionManager(source));
        dsl = DSL.using(new TransactionAwareDataSourceProxy(source), SQLDialect.POSTGRES);
        reviews = new CompanyReviewService(new JooqCompanyReviewRepository(dsl), Clock.systemUTC());
    }

    @AfterAll
    static void stop() { POSTGRES.stop(); }

    @Test
    void concurrentApprovalsProduceOneVersionAndOneAuditEntry() throws Exception {
        var company = pending();
        var start = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var work = List.of(11L, 12L).stream().map(actor -> pool.submit(() -> {
                start.await();
                try {
                    transactions.executeWithoutResult(tx -> reviews.approve(actor, company.id(), 0, "Reviewed", UUID.randomUUID()));
                    return true;
                } catch (CompanyConflictException expected) {
                    return false;
                }
            })).toList();
            start.countDown();
            int successful = 0;
            for (var result : work) if (result.get(15, TimeUnit.SECONDS)) successful++;
            assertThat(successful).isEqualTo(1);
        }
        var approved = new JooqCompanyReviewRepository(dsl).findById(company.id()).orElseThrow();
        assertThat(approved.status()).isEqualTo(CompanyStatus.ACTIVE);
        assertThat(approved.version()).isEqualTo(1);
        assertThat(approved.verificationStatus()).isEqualTo(CompanyVerificationStatus.UNVERIFIED);
        assertThat(reviews.history(company.id())).singleElement().satisfies(change -> {
            assertThat(change.actorUserId()).isIn(11L, 12L);
            assertThat(change.reason()).isEqualTo("Reviewed");
            assertThat(change.correlationId()).isNotNull();
            assertThat(change.fromStatus()).isEqualTo(CompanyStatus.PENDING);
            assertThat(change.toStatus()).isEqualTo(CompanyStatus.ACTIVE);
        });
    }

    @Test
    void stateAndAuditRollbackTogether() {
        var company = pending();
        assertThatThrownBy(() -> transactions.executeWithoutResult(tx -> {
            reviews.approve(11L, company.id(), 0, "Reviewed", UUID.randomUUID());
            throw new IllegalStateException("Synthetic transaction failure");
        })).isInstanceOf(IllegalStateException.class);
        var persisted = new JooqCompanyReviewRepository(dsl).findById(company.id()).orElseThrow();
        assertThat(persisted.status()).isEqualTo(CompanyStatus.PENDING);
        assertThat(persisted.version()).isZero();
        assertThat(reviews.history(company.id())).isEmpty();
    }

    @Test
    void queueFiltersAndPagesBeforeApprovalAndPreservesSearchLiterals() {
        var company = pending();
        var search = new CompanyReviewSearch(0, 1, company.slug(), CompanyStatus.PENDING);
        assertThat(reviews.search(search).items()).extracting(Company::id).containsExactly(company.id());
        assertThat(reviews.search(new CompanyReviewSearch(1, 1, company.slug(), CompanyStatus.PENDING)).items()).isEmpty();
        assertThat(reviews.search(new CompanyReviewSearch(0, 20, "%", null)).items()).isEmpty();
        transactions.executeWithoutResult(tx -> reviews.approve(11L, company.id(), 0, "Reviewed", UUID.randomUUID()));
        assertThat(reviews.search(search).total()).isZero();
        assertThat(reviews.search(new CompanyReviewSearch(0, 20, company.slug(), CompanyStatus.ACTIVE)).total()).isOne();
    }

    @ParameterizedTest
    @EnumSource(value = CompanyStatus.class, names = {"PENDING", "SUSPENDED", "CLOSED"})
    void nonActiveCompaniesCannotPublishAppearPubliclyOrReceiveNewApplications(CompanyStatus status) {
        var company = pending();
        var jobs = new JooqJobRepository(dsl);
        var version = new JobVersion(0L, 1, "Approval job " + company.id(), "Synthetic description", "Java",
                null, "Approval city " + company.id(), "VN", null, null, null, 1,
                null, null, null, null, false, null, "a".repeat(64), company.createdByUserId());
        var job = jobs.insert(Job.draft(company.id(), company.createdByUserId(), version));
        dsl.update(COMPANIES).set(COMPANIES.STATUS, status.name()).where(COMPANIES.ID.eq(company.id())).execute();
        assertThat(jobs.publish(job.id(), company.createdByUserId(), 0, OffsetDateTime.now())).isEmpty();
        // Simulate historical PUBLISHED data created before the approval policy.
        dsl.update(JOBS).set(JOBS.STATUS, "PUBLISHED").set(JOBS.PUBLISHED_AT, OffsetDateTime.now())
                .where(JOBS.ID.eq(job.id())).execute();
        var search = new JobSearch(0, 10, "", "newest", company.id(), null, null, null, null, null);
        assertThat(jobs.searchPublished(search).items()).isEmpty();
        assertThat(jobs.findPublished()).noneMatch(item -> item.id().equals(job.id()));
        assertThat(jobs.publishedCountsByCompany()).doesNotContainKey(company.id());
        assertThat(jobs.publishedDiscovery().locations()).doesNotContain(version.locationText());
        assertThat(new JooqCompanyRepository(dsl).findById(company.id())).isEmpty();
        assertThat(new JooqCompanyRepository(dsl).findPublic()).noneMatch(item -> item.id().equals(company.id()));
        Long candidate = TestIds.next();
        Long cv = confirmedCv(candidate);
        var applications = new JooqApplicationRepository(dsl);
        assertThatThrownBy(() -> applications.insert(candidate, job.id(), cv)).isInstanceOf(IllegalArgumentException.class);
        if (status == CompanyStatus.PENDING) {
            transactions.executeWithoutResult(tx -> reviews.approve(11L, company.id(), 0, "Reviewed", UUID.randomUUID()));
            assertThat(jobs.searchPublished(search).total()).isOne();
            assertThat(jobs.findPublished()).anyMatch(item -> item.id().equals(job.id()));
            assertThat(jobs.publishedCountsByCompany()).containsEntry(company.id(), 1);
            assertThat(jobs.publishedDiscovery().locations()).contains(version.locationText());
            assertThat(new JooqCompanyRepository(dsl).findById(company.id())).isPresent();
            assertThat(applications.insert(candidate, job.id(), cv).jobId()).isEqualTo(job.id());
        }
    }

    @Test
    void adminCanRejectPendingOrSuspendAndReactivateWithAuditTrail() {
        var toReject = pending();
        transactions.executeWithoutResult(tx -> reviews.reject(11L, toReject.id(), 0, "Invalid business license", UUID.randomUUID()));
        var rejected = new JooqCompanyReviewRepository(dsl).findById(toReject.id()).orElseThrow();
        assertThat(rejected.status()).isEqualTo(CompanyStatus.CLOSED);
        assertThat(rejected.version()).isEqualTo(1);
        assertThat(reviews.history(toReject.id())).singleElement().satisfies(entry -> {
            assertThat(entry.action()).isEqualTo("REJECT");
            assertThat(entry.fromStatus()).isEqualTo(CompanyStatus.PENDING);
            assertThat(entry.toStatus()).isEqualTo(CompanyStatus.CLOSED);
        });

        var toCycle = pending();
        transactions.executeWithoutResult(tx -> {
            var active = reviews.approve(11L, toCycle.id(), 0, "Initial approval", UUID.randomUUID());
            var suspended = reviews.suspend(12L, toCycle.id(), active.version(), "Temporary hold", UUID.randomUUID());
            reviews.reactivate(13L, toCycle.id(), suspended.version(), "Compliance confirmed", UUID.randomUUID());
        });
        var finalCompany = new JooqCompanyReviewRepository(dsl).findById(toCycle.id()).orElseThrow();
        assertThat(finalCompany.status()).isEqualTo(CompanyStatus.ACTIVE);
        assertThat(finalCompany.version()).isEqualTo(3);
        assertThat(reviews.history(toCycle.id()))
                .extracting(change -> change.action() + ":" + change.fromStatus() + "->" + change.toStatus())
                .containsExactly("REACTIVATE:SUSPENDED->ACTIVE", "SUSPEND:ACTIVE->SUSPENDED", "APPROVE:PENDING->ACTIVE");
    }

    @Test
    void dashboardMetricsIncludeFullPipelineStagesAndCumulativeShortlisted() {
        var company = pending();
        transactions.executeWithoutResult(tx -> reviews.approve(11L, company.id(), 0, "Approved", UUID.randomUUID()));
        var jobs = new JooqJobRepository(dsl);
        var version = new JobVersion(0L, 1, "Pipeline Job " + company.id(), "Backend services", "Java",
                null, "Ha Noi", "VN", null, null, null, 2,
                null, null, null, null, false, null, "c".repeat(64), company.createdByUserId());
        var job = jobs.insert(Job.draft(company.id(), company.createdByUserId(), version));
        jobs.publish(job.id(), company.createdByUserId(), 0, OffsetDateTime.now()).orElseThrow();

        var applications = new JooqApplicationRepository(dsl);
        Long c1 = TestIds.next(), c2 = TestIds.next(), c3 = TestIds.next();
        var app1 = applications.insert(c1, job.id(), confirmedCv(c1));
        var app2 = applications.insert(c2, job.id(), confirmedCv(c2));
        var app3 = applications.insert(c3, job.id(), confirmedCv(c3));

        app1 = applications.updateStatus(company.createdByUserId(), app1.id(), ApplicationStatus.UNDER_REVIEW, "Review", app1.version()).orElseThrow();
        app1 = applications.updateStatus(company.createdByUserId(), app1.id(), ApplicationStatus.SHORTLISTED, "Shortlist", app1.version()).orElseThrow();
        app1 = applications.updateStatus(company.createdByUserId(), app1.id(), ApplicationStatus.INTERVIEW, "Interview", app1.version()).orElseThrow();
        app1 = applications.updateStatus(company.createdByUserId(), app1.id(), ApplicationStatus.OFFERED, "Offer", app1.version()).orElseThrow();
        applications.updateStatus(company.createdByUserId(), app1.id(), ApplicationStatus.HIRED, "Hired", app1.version()).orElseThrow();

        app2 = applications.updateStatus(company.createdByUserId(), app2.id(), ApplicationStatus.UNDER_REVIEW, "Review", app2.version()).orElseThrow();
        app2 = applications.updateStatus(company.createdByUserId(), app2.id(), ApplicationStatus.SHORTLISTED, "Shortlist", app2.version()).orElseThrow();
        applications.updateStatus(company.createdByUserId(), app2.id(), ApplicationStatus.REJECTED, "Declined", app2.version()).orElseThrow();

        applications.withdraw(c3, app3.id(), "Accepted another offer", app3.version()).orElseThrow();

        var dashboard = new JooqDashboardRepository(dsl);
        var recruiterMetrics = dashboard.recruiterMetrics(company.createdByUserId(), company.id());
        assertThat(recruiterMetrics)
                .containsEntry("applications", 3L)
                .containsEntry("submitted", 0L)
                .containsEntry("underReview", 0L)
                .containsEntry("shortlisted", 0L)
                .containsEntry("interview", 0L)
                .containsEntry("offered", 0L)
                .containsEntry("hired", 1L)
                .containsEntry("rejected", 1L)
                .containsEntry("withdrawn", 1L)
                .containsEntry("reachedShortlisted", 2L);

        var candidateMetrics = dashboard.candidateMetrics(c1);
        assertThat(candidateMetrics)
                .containsEntry("applications", 1L)
                .containsEntry("hired", 1L)
                .containsEntry("reachedShortlisted", 1L);
    }

    private static Company pending() {
        Long owner = TestIds.next();
        return new JooqCompanyRepository(dsl).insertWithOwner(Company.create(owner, "Synthetic Legal", "Synthetic Company",
                "review-" + TestIds.next(), null, null, "VN", null, null), owner);
    }

    private static Long confirmedCv(Long candidate) {
        var cvs = new JooqCandidateCvRepository(dsl);
        var cv = cvs.insert(CandidateCv.uploaded(candidate, "Synthetic CV", CvVersion.uploaded(0L, "fixture",
                "synthetic-" + TestIds.next() + ".pdf", "synthetic.pdf", 100, "b".repeat(64), candidate)));
        assertThat(cvs.updateProcessingStatus(cv.activeVersion().id(), "b".repeat(64), CvProcessingStatus.CONFIRMED, null)).isTrue();
        return cv.id();
    }
}
