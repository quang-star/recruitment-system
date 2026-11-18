package com.smartrecruitment.core.dashboard.infrastructure.persistence;

import com.smartrecruitment.core.dashboard.application.port.DashboardRepository;
import org.jooq.DSLContext;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.Map;

import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.Applications.APPLICATIONS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.ApplicationStatusHistory.APPLICATION_STATUS_HISTORY;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.Companies.COMPANIES;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.CompanyMembers.COMPANY_MEMBERS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.Cvs.CVS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.Jobs.JOBS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.JobVersions.JOB_VERSIONS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.Notifications.NOTIFICATIONS;
import org.jooq.impl.DSL;

@Repository
public class JooqDashboardRepository implements DashboardRepository {
    private final DSLContext dsl;

    public JooqDashboardRepository(DSLContext dsl) { this.dsl = dsl; }

    private static final String[] REACHED_SHORTLIST_STATUSES = {"SHORTLISTED", "INTERVIEW", "OFFERED", "HIRED"};

    @Override
    public Map<String, Long> candidateMetrics(Long userId) {
        Map<String, Long> metrics = new LinkedHashMap<>();
        metrics.put("cvs", count(dsl.fetchCount(dsl.selectOne().from(CVS)
                .where(CVS.CANDIDATE_USER_ID.eq(userId)).and(CVS.STATUS.ne("DELETED")))));
        populateApplicationMetrics(metrics, APPLICATIONS.CANDIDATE_USER_ID.eq(userId));
        metrics.put("unreadNotifications", unread(userId));
        return metrics;
    }

    @Override
    public Map<String, Long> recruiterMetrics(Long userId, Long companyId, Integer days) {
        Long internalCompanyId = dsl.select(COMPANIES.ID).from(COMPANIES)
                .join(COMPANY_MEMBERS).on(COMPANY_MEMBERS.COMPANY_ID.eq(COMPANIES.ID))
                .where(COMPANIES.ID.eq(companyId)).and(COMPANY_MEMBERS.USER_ID.eq(userId))
                .and(COMPANY_MEMBERS.STATUS.eq("ACTIVE")).fetchOne(COMPANIES.ID);
        Map<String, Long> metrics = new LinkedHashMap<>();
        if (internalCompanyId == null) return metrics;
        metrics.put("jobs", count(dsl.fetchCount(dsl.selectOne().from(JOBS)
                .where(JOBS.COMPANY_ID.eq(internalCompanyId)))));
        metrics.put("publishedJobs", count(dsl.fetchCount(dsl.selectOne().from(JOBS)
                .where(JOBS.COMPANY_ID.eq(internalCompanyId)).and(JOBS.STATUS.eq("PUBLISHED")))));
        metrics.put("draftJobs", count(dsl.fetchCount(dsl.selectOne().from(JOBS)
                .where(JOBS.COMPANY_ID.eq(internalCompanyId)).and(JOBS.STATUS.eq("DRAFT")))));
        metrics.put("closedJobs", count(dsl.fetchCount(dsl.selectOne().from(JOBS)
                .where(JOBS.COMPANY_ID.eq(internalCompanyId)).and(JOBS.STATUS.eq("CLOSED")))));
        org.jooq.Condition applicationCondition = APPLICATIONS.COMPANY_ID.eq(internalCompanyId);
        if (days != null && days > 0) {
            applicationCondition = applicationCondition.and(
                    APPLICATIONS.APPLIED_AT.ge(OffsetDateTime.now(ZoneOffset.UTC).minusDays(days))
            );
        }
        populateApplicationMetrics(metrics, applicationCondition);
        metrics.put("unreadNotifications", unread(userId));
        return metrics;
    }

    private void populateApplicationMetrics(Map<String, Long> metrics, org.jooq.Condition ownerCondition) {
        var counts = dsl.select(APPLICATIONS.STATUS, DSL.count())
                .from(APPLICATIONS)
                .where(ownerCondition)
                .groupBy(APPLICATIONS.STATUS)
                .fetchMap(APPLICATIONS.STATUS, DSL.count());
        long submitted = count(counts.getOrDefault("SUBMITTED", 0));
        long underReview = count(counts.getOrDefault("UNDER_REVIEW", 0));
        long shortlisted = count(counts.getOrDefault("SHORTLISTED", 0));
        long interview = count(counts.getOrDefault("INTERVIEW", 0));
        long offered = count(counts.getOrDefault("OFFERED", 0));
        long hired = count(counts.getOrDefault("HIRED", 0));
        long rejected = count(counts.getOrDefault("REJECTED", 0));
        long withdrawn = count(counts.getOrDefault("WITHDRAWN", 0));
        long total = submitted + underReview + shortlisted + interview + offered + hired + rejected + withdrawn;
        long reachedShortlisted = count(dsl.fetchCount(dsl.selectOne()
                .from(APPLICATIONS)
                .where(ownerCondition)
                .and(APPLICATIONS.STATUS.in(REACHED_SHORTLIST_STATUSES)
                        .or(DSL.exists(dsl.selectOne().from(APPLICATION_STATUS_HISTORY)
                                .where(APPLICATION_STATUS_HISTORY.APPLICATION_ID.eq(APPLICATIONS.ID))
                                .and(APPLICATION_STATUS_HISTORY.TO_STATUS.in(REACHED_SHORTLIST_STATUSES)))))));
        metrics.put("applications", total);
        metrics.put("submitted", submitted);
        metrics.put("underReview", underReview);
        metrics.put("shortlisted", shortlisted);
        metrics.put("interview", interview);
        metrics.put("offered", offered);
        metrics.put("hired", hired);
        metrics.put("rejected", rejected);
        metrics.put("withdrawn", withdrawn);
        metrics.put("reachedShortlisted", reachedShortlisted);
    }

    @Override
    public PendingJobInfo findPendingActionJob(Long userId, Long companyId) {
        Long internalCompanyId = dsl.select(COMPANIES.ID).from(COMPANIES)
                .join(COMPANY_MEMBERS).on(COMPANY_MEMBERS.COMPANY_ID.eq(COMPANIES.ID))
                .where(COMPANIES.ID.eq(companyId)).and(COMPANY_MEMBERS.USER_ID.eq(userId))
                .and(COMPANY_MEMBERS.STATUS.eq("ACTIVE")).fetchOne(COMPANIES.ID);
        if (internalCompanyId == null) return null;

        var record = dsl.select(JOBS.ID, JOB_VERSIONS.TITLE)
                .from(APPLICATIONS)
                .join(JOBS).on(JOBS.ID.eq(APPLICATIONS.JOB_ID))
                .join(JOB_VERSIONS).on(JOB_VERSIONS.ID.eq(APPLICATIONS.JOB_VERSION_ID))
                .where(APPLICATIONS.COMPANY_ID.eq(internalCompanyId))
                .and(APPLICATIONS.STATUS.in("SUBMITTED", "UNDER_REVIEW"))
                .orderBy(
                        DSL.when(APPLICATIONS.STATUS.eq("SUBMITTED"), 0).otherwise(1).asc(),
                        APPLICATIONS.APPLIED_AT.asc()
                )
                .limit(1)
                .fetchOne();

        if (record == null) return null;
        return new PendingJobInfo(record.get(JOBS.ID), record.get(JOB_VERSIONS.TITLE));
    }

    private long unread(Long userId) {
        return count(dsl.fetchCount(dsl.selectOne().from(NOTIFICATIONS)
                .where(NOTIFICATIONS.USER_ID.eq(userId)).and(NOTIFICATIONS.READ_AT.isNull())));
    }

    private static long count(int value) { return value; }
}

