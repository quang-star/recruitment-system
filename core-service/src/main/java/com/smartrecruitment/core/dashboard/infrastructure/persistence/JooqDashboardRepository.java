package com.smartrecruitment.core.dashboard.infrastructure.persistence;

import com.smartrecruitment.core.dashboard.application.port.DashboardRepository;
import org.jooq.DSLContext;
import org.springframework.stereotype.Repository;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.Applications.APPLICATIONS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.Companies.COMPANIES;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.CompanyMembers.COMPANY_MEMBERS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.Cvs.CVS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.Jobs.JOBS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.Notifications.NOTIFICATIONS;

@Repository
public class JooqDashboardRepository implements DashboardRepository {
    private final DSLContext dsl;

    public JooqDashboardRepository(DSLContext dsl) { this.dsl = dsl; }

    @Override
    public Map<String, Long> candidateMetrics(UUID userId) {
        Map<String, Long> metrics = new LinkedHashMap<>();
        metrics.put("cvs", count(dsl.fetchCount(dsl.selectOne().from(CVS)
                .where(CVS.CANDIDATE_USER_ID.eq(userId)).and(CVS.STATUS.ne("DELETED")))));
        metrics.put("applications", count(dsl.fetchCount(dsl.selectOne().from(APPLICATIONS)
                .where(APPLICATIONS.CANDIDATE_USER_ID.eq(userId)))));
        metrics.put("underReview", count(dsl.fetchCount(dsl.selectOne().from(APPLICATIONS)
                .where(APPLICATIONS.CANDIDATE_USER_ID.eq(userId)).and(APPLICATIONS.STATUS.eq("UNDER_REVIEW")))));
        metrics.put("shortlisted", count(dsl.fetchCount(dsl.selectOne().from(APPLICATIONS)
                .where(APPLICATIONS.CANDIDATE_USER_ID.eq(userId)).and(APPLICATIONS.STATUS.eq("SHORTLISTED")))));
        metrics.put("unreadNotifications", unread(userId));
        return metrics;
    }

    @Override
    public Map<String, Long> recruiterMetrics(UUID userId, UUID companyId) {
        Long internalCompanyId = dsl.select(COMPANIES.ID).from(COMPANIES)
                .join(COMPANY_MEMBERS).on(COMPANY_MEMBERS.COMPANY_ID.eq(COMPANIES.ID))
                .where(COMPANIES.PUBLIC_ID.eq(companyId)).and(COMPANY_MEMBERS.USER_ID.eq(userId))
                .and(COMPANY_MEMBERS.STATUS.eq("ACTIVE")).fetchOne(COMPANIES.ID);
        Map<String, Long> metrics = new LinkedHashMap<>();
        if (internalCompanyId == null) return metrics;
        metrics.put("jobs", count(dsl.fetchCount(dsl.selectOne().from(JOBS)
                .where(JOBS.COMPANY_ID.eq(internalCompanyId)))));
        metrics.put("publishedJobs", count(dsl.fetchCount(dsl.selectOne().from(JOBS)
                .where(JOBS.COMPANY_ID.eq(internalCompanyId)).and(JOBS.STATUS.eq("PUBLISHED")))));
        metrics.put("applications", count(dsl.fetchCount(dsl.selectOne().from(APPLICATIONS)
                .where(APPLICATIONS.COMPANY_ID.eq(internalCompanyId)))));
        metrics.put("shortlisted", count(dsl.fetchCount(dsl.selectOne().from(APPLICATIONS)
                .where(APPLICATIONS.COMPANY_ID.eq(internalCompanyId)).and(APPLICATIONS.STATUS.eq("SHORTLISTED")))));
        metrics.put("unreadNotifications", unread(userId));
        return metrics;
    }

    private long unread(UUID userId) {
        return count(dsl.fetchCount(dsl.selectOne().from(NOTIFICATIONS)
                .where(NOTIFICATIONS.USER_ID.eq(userId)).and(NOTIFICATIONS.READ_AT.isNull())));
    }

    private static long count(int value) { return value; }
}

