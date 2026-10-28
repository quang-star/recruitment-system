package com.smartrecruitment.core.reprocessing.infrastructure.persistence;

import com.smartrecruitment.core.reprocessing.application.ReprocessingEligibilityCheck;
import com.smartrecruitment.core.reprocessing.application.port.ReprocessingEligibilityRepository;
import org.jooq.DSLContext;
import org.jooq.impl.DSL;
import org.springframework.stereotype.Repository;

import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.ApplicationCvAccessGrants.APPLICATION_CV_ACCESS_GRANTS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.Applications.APPLICATIONS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.CandidateConsents.CANDIDATE_CONSENTS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.Companies.COMPANIES;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.CompanyMembers.COMPANY_MEMBERS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.CvVersions.CV_VERSIONS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.Cvs.CVS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.JobVersions.JOB_VERSIONS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.Jobs.JOBS;

@Repository
public class JooqReprocessingEligibilityRepository implements ReprocessingEligibilityRepository {
    private final DSLContext dsl;

    public JooqReprocessingEligibilityRepository(DSLContext dsl) { this.dsl = dsl; }

    @Override
    public Reason check(ReprocessingEligibilityCheck check) {
        return switch (check.operation()) {
            case PARSE_CV -> cv(check);
            case PARSE_JD -> jd(check);
            case MATCH_APPLICATION -> matching(check);
        };
    }

    private Reason cv(ReprocessingEligibilityCheck check) {
        var source = dsl.select(CVS.STATUS, CVS.CANDIDATE_USER_ID, CVS.ACTIVE_VERSION_ID,
                        CV_VERSIONS.ID, CV_VERSIONS.SHA256, CV_VERSIONS.PROCESSING_STATUS)
                .from(CV_VERSIONS).join(CVS).on(CVS.ID.eq(CV_VERSIONS.CV_ID))
                .where(CV_VERSIONS.ID.eq(check.resourceId())).fetchOne();
        if (source == null || !"ACTIVE".equals(source.get(CVS.STATUS))
                || "DELETED".equals(source.get(CV_VERSIONS.PROCESSING_STATUS))) return Reason.SOURCE_NOT_AVAILABLE;
        if (!check.sourceOwnerId().equals(source.get(CVS.CANDIDATE_USER_ID))
                || !check.sourceHash().equals(source.get(CV_VERSIONS.SHA256))
                || !source.get(CV_VERSIONS.ID).equals(source.get(CVS.ACTIVE_VERSION_ID))) return Reason.SOURCE_CHANGED;
        return Reason.LIVE;
    }

    private Reason jd(ReprocessingEligibilityCheck check) {
        var canRecruit = DSL.field(DSL.exists(dsl.selectOne().from(COMPANY_MEMBERS)
                .where(COMPANY_MEMBERS.COMPANY_ID.eq(JOBS.COMPANY_ID))
                .and(COMPANY_MEMBERS.USER_ID.eq(JOB_VERSIONS.CREATED_BY_USER_ID))
                .and(COMPANY_MEMBERS.STATUS.eq("ACTIVE"))
                .and(COMPANY_MEMBERS.ROLE.in("OWNER", "COMPANY_ADMIN", "RECRUITER")))).as("can_recruit");
        var source = dsl.select(JOBS.STATUS, JOBS.ACTIVE_VERSION_ID, JOB_VERSIONS.ID,
                        JOB_VERSIONS.CREATED_BY_USER_ID, JOB_VERSIONS.SOURCE_HASH, JOB_VERSIONS.MATCHING_DOMAIN, canRecruit)
                .from(JOB_VERSIONS).join(JOBS).on(JOBS.ID.eq(JOB_VERSIONS.JOB_ID))
                .join(COMPANIES).on(COMPANIES.ID.eq(JOBS.COMPANY_ID))
                .where(JOB_VERSIONS.ID.eq(check.resourceId())).fetchOne();
        if (source == null || "CLOSED".equals(source.get(JOBS.STATUS))) return Reason.SOURCE_NOT_AVAILABLE;
        if (!check.sourceOwnerId().equals(source.get(JOB_VERSIONS.CREATED_BY_USER_ID))
                || !check.sourceHash().equals(source.get(JOB_VERSIONS.SOURCE_HASH))
                || !source.get(JOB_VERSIONS.ID).equals(source.get(JOBS.ACTIVE_VERSION_ID))) return Reason.SOURCE_CHANGED;
        if (!Boolean.TRUE.equals(source.get(canRecruit))) return Reason.ACCESS_REVOKED;
        return "IT".equals(source.get(JOB_VERSIONS.MATCHING_DOMAIN)) ? Reason.LIVE : Reason.OUTSIDE_IT;
    }

    private Reason matching(ReprocessingEligibilityCheck check) {
        var granted = DSL.exists(dsl.selectOne().from(APPLICATION_CV_ACCESS_GRANTS)
                .join(CANDIDATE_CONSENTS).on(CANDIDATE_CONSENTS.ID.eq(APPLICATION_CV_ACCESS_GRANTS.CONSENT_ID))
                .where(APPLICATION_CV_ACCESS_GRANTS.APPLICATION_ID.eq(APPLICATIONS.ID))
                .and(APPLICATION_CV_ACCESS_GRANTS.CV_VERSION_ID.eq(APPLICATIONS.CV_VERSION_ID))
                .and(APPLICATION_CV_ACCESS_GRANTS.COMPANY_ID.eq(APPLICATIONS.COMPANY_ID))
                .and(APPLICATION_CV_ACCESS_GRANTS.REVOKED_AT.isNull())
                .and(CANDIDATE_CONSENTS.CANDIDATE_USER_ID.eq(APPLICATIONS.CANDIDATE_USER_ID))
                .and(CANDIDATE_CONSENTS.CONSENT_TYPE.eq("CV_SHARING"))
                .and(CANDIDATE_CONSENTS.POLICY_VERSION.eq(APPLICATIONS.CONSENT_POLICY_VERSION))
                .and(CANDIDATE_CONSENTS.REVOKED_AT.isNull()));
        var grantedField = DSL.field(granted).as("granted");
        var source = dsl.select(APPLICATIONS.STATUS, APPLICATIONS.CONSENT_ACCEPTED,
                        APPLICATIONS.CANDIDATE_USER_ID, CVS.CANDIDATE_USER_ID, CVS.STATUS,
                        CV_VERSIONS.ID, CV_VERSIONS.PROCESSING_STATUS, JOB_VERSIONS.ID,
                        JOB_VERSIONS.MATCHING_DOMAIN, grantedField)
                .from(APPLICATIONS).join(CVS).on(CVS.ID.eq(APPLICATIONS.CV_ID))
                .join(CV_VERSIONS).on(CV_VERSIONS.ID.eq(APPLICATIONS.CV_VERSION_ID).and(CV_VERSIONS.CV_ID.eq(CVS.ID)))
                .join(JOB_VERSIONS).on(JOB_VERSIONS.ID.eq(APPLICATIONS.JOB_VERSION_ID).and(JOB_VERSIONS.JOB_ID.eq(APPLICATIONS.JOB_ID)))
                .where(APPLICATIONS.ID.eq(check.resourceId())).fetchOne();
        if (source == null || "DELETED".equals(source.get(CVS.STATUS))
                || "DELETED".equals(source.get(CV_VERSIONS.PROCESSING_STATUS))) return Reason.SOURCE_NOT_AVAILABLE;
        if (!check.cvVersionId().equals(source.get(CV_VERSIONS.ID))
                || !check.jobVersionId().equals(source.get(JOB_VERSIONS.ID))) return Reason.SOURCE_CHANGED;
        if ("WITHDRAWN".equals(source.get(APPLICATIONS.STATUS))
                || !Boolean.TRUE.equals(source.get(APPLICATIONS.CONSENT_ACCEPTED))
                || !source.get(APPLICATIONS.CANDIDATE_USER_ID).equals(source.get(CVS.CANDIDATE_USER_ID))
                || !Boolean.TRUE.equals(source.get(grantedField))) return Reason.ACCESS_REVOKED;
        return "IT".equals(source.get(JOB_VERSIONS.MATCHING_DOMAIN)) ? Reason.LIVE : Reason.OUTSIDE_IT;
    }
}
