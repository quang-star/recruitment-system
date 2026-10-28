package com.smartrecruitment.core.dashboard.infrastructure.persistence;

import com.smartrecruitment.core.dashboard.application.port.DashboardRepository;
import org.jooq.DSLContext;
import org.springframework.stereotype.Repository;

import java.util.LinkedHashMap;
import java.util.Map;

import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.Applications.APPLICATIONS;
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

    @Override
    public Map<String, Long> candidateMetrics(Long userId) {
        Map<String, Long> metrics = new LinkedHashMap<>();
        metrics.put("cvs", count(dsl.fetchCount(dsl.selectOne().from(CVS)
                .where(CVS.CANDIDATE_USER_ID.eq(userId)).and(CVS.STATUS.ne("DELETED")))));
        metrics.put("applications", count(dsl.fetchCount(dsl.selectOne().from(APPLICATIONS)
                .where(APPLICATIONS.CANDIDATE_USER_ID.eq(userId)))));
        metrics.put("submitted", count(dsl.fetchCount(dsl.selectOne().from(APPLICATIONS)
                .where(APPLICATIONS.CANDIDATE_USER_ID.eq(userId)).and(APPLICATIONS.STATUS.eq("SUBMITTED")))));
        metrics.put("underReview", count(dsl.fetchCount(dsl.selectOne().from(APPLICATIONS)
                .where(APPLICATIONS.CANDIDATE_USER_ID.eq(userId)).and(APPLICATIONS.STATUS.eq("UNDER_REVIEW")))));
        metrics.put("shortlisted", count(dsl.fetchCount(dsl.selectOne().from(APPLICATIONS)
                .where(APPLICATIONS.CANDIDATE_USER_ID.eq(userId)).and(APPLICATIONS.STATUS.eq("SHORTLISTED")))));
        metrics.put("rejected", count(dsl.fetchCount(dsl.selectOne().from(APPLICATIONS)
                .where(APPLICATIONS.CANDIDATE_USER_ID.eq(userId)).and(APPLICATIONS.STATUS.eq("REJECTED")))));
        metrics.put("unreadNotifications", unread(userId));
        return metrics;
    }

    @Override
    public Map<String, Long> recruiterMetrics(Long userId, Long companyId) {
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
        metrics.put("applications", count(dsl.fetchCount(dsl.selectOne().from(APPLICATIONS)
                .where(APPLICATIONS.COMPANY_ID.eq(internalCompanyId)))));
        metrics.put("submitted", count(dsl.fetchCount(dsl.selectOne().from(APPLICATIONS)
                .where(APPLICATIONS.COMPANY_ID.eq(internalCompanyId)).and(APPLICATIONS.STATUS.eq("SUBMITTED")))));
        metrics.put("underReview", count(dsl.fetchCount(dsl.selectOne().from(APPLICATIONS)
                .where(APPLICATIONS.COMPANY_ID.eq(internalCompanyId)).and(APPLICATIONS.STATUS.eq("UNDER_REVIEW")))));
        metrics.put("shortlisted", count(dsl.fetchCount(dsl.selectOne().from(APPLICATIONS)
                .where(APPLICATIONS.COMPANY_ID.eq(internalCompanyId)).and(APPLICATIONS.STATUS.eq("SHORTLISTED")))));
        metrics.put("rejected", count(dsl.fetchCount(dsl.selectOne().from(APPLICATIONS)
                .where(APPLICATIONS.COMPANY_ID.eq(internalCompanyId)).and(APPLICATIONS.STATUS.eq("REJECTED")))));
        metrics.put("unreadNotifications", unread(userId));
        return metrics;
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

