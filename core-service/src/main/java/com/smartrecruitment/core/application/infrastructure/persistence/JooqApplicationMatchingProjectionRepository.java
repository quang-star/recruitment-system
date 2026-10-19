package com.smartrecruitment.core.application.infrastructure.persistence;

import org.jooq.DSLContext;
import org.jooq.JSON;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;

import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.ApplicationMatchingProjections.APPLICATION_MATCHING_PROJECTIONS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.Applications.APPLICATIONS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.CompanyMembers.COMPANY_MEMBERS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.Jobs.JOBS;

import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.JobVersions.JOB_VERSIONS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.CvVersions.CV_VERSIONS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.Cvs.CVS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.ApplicationCvAccessGrants.APPLICATION_CV_ACCESS_GRANTS;
import static com.smartrecruitment.core.infrastructure.jooq.generated.tables.CandidateConsents.CANDIDATE_CONSENTS;
import org.jooq.impl.DSL;

@Repository
public class JooqApplicationMatchingProjectionRepository {
    private final DSLContext dsl;

    public JooqApplicationMatchingProjectionRepository(DSLContext dsl) { this.dsl = dsl; }

    @Transactional
    public boolean update(UUID applicationId, UUID cvVersionId, UUID jobVersionId,
                       UUID matchingResultId, String status, double finalScore,
                       String qualityFlagsJson, String explanationJson,
                       String algorithmVersion, String taxonomyVersion) {
        // Serialize with withdrawal/erasure; a late result cannot restore a revoked projection.
        var application = dsl.select(APPLICATIONS.ID).from(APPLICATIONS)
                .where(APPLICATIONS.PUBLIC_ID.eq(applicationId)).forUpdate().fetchOne();
        if (application == null) return false;
        boolean eligible = dsl.fetchExists(dsl.selectOne().from(APPLICATIONS)
                .join(JOB_VERSIONS).on(JOB_VERSIONS.ID.eq(APPLICATIONS.JOB_VERSION_ID))
                .join(CV_VERSIONS).on(CV_VERSIONS.ID.eq(APPLICATIONS.CV_VERSION_ID))
                .join(CVS).on(CVS.ID.eq(APPLICATIONS.CV_ID))
                .where(APPLICATIONS.PUBLIC_ID.eq(applicationId)).and(JOB_VERSIONS.PUBLIC_ID.eq(jobVersionId))
                .and(CV_VERSIONS.PUBLIC_ID.eq(cvVersionId)).and(JOB_VERSIONS.MATCHING_DOMAIN.eq("IT"))
                .and(CVS.STATUS.ne("DELETED")).and(CV_VERSIONS.PROCESSING_STATUS.ne("DELETED"))
                .and(CVS.CANDIDATE_USER_ID.eq(APPLICATIONS.CANDIDATE_USER_ID))
                .and(APPLICATIONS.CONSENT_ACCEPTED.eq(true)).and(APPLICATIONS.STATUS.ne("WITHDRAWN")).and(granted()));
        if (!eligible) return false;
        var current = dsl.selectFrom(APPLICATION_MATCHING_PROJECTIONS)
                .where(APPLICATION_MATCHING_PROJECTIONS.APPLICATION_ID.eq(applicationId)).fetchOne();
        if (current == null) {
            dsl.insertInto(APPLICATION_MATCHING_PROJECTIONS)
                    .set(APPLICATION_MATCHING_PROJECTIONS.APPLICATION_ID, applicationId)
                    .set(APPLICATION_MATCHING_PROJECTIONS.CV_VERSION_ID, cvVersionId)
                    .set(APPLICATION_MATCHING_PROJECTIONS.JOB_VERSION_ID, jobVersionId)
                    .set(APPLICATION_MATCHING_PROJECTIONS.MATCHING_RESULT_ID, matchingResultId)
                    .set(APPLICATION_MATCHING_PROJECTIONS.STATUS, status)
                    .set(APPLICATION_MATCHING_PROJECTIONS.FINAL_SCORE, java.math.BigDecimal.valueOf(finalScore))
                    .set(APPLICATION_MATCHING_PROJECTIONS.QUALITY_FLAGS, JSON.json(qualityFlagsJson))
                    .set(APPLICATION_MATCHING_PROJECTIONS.EXPLANATION, JSON.json(explanationJson))
                    .set(APPLICATION_MATCHING_PROJECTIONS.ALGORITHM_VERSION, algorithmVersion)
                    .set(APPLICATION_MATCHING_PROJECTIONS.TAXONOMY_VERSION, taxonomyVersion)
                    .set(APPLICATION_MATCHING_PROJECTIONS.UPDATED_AT, OffsetDateTime.now(ZoneOffset.UTC))
                    .set(APPLICATION_MATCHING_PROJECTIONS.VERSION, 0L)
                    .execute();
            return true;
        }
        if (!cvVersionId.equals(current.getCvVersionId()) || !jobVersionId.equals(current.getJobVersionId())) return false;
        if (matchingResultId.equals(current.getMatchingResultId())) return false;
        return dsl.update(APPLICATION_MATCHING_PROJECTIONS)
                .set(APPLICATION_MATCHING_PROJECTIONS.MATCHING_RESULT_ID, matchingResultId)
                .set(APPLICATION_MATCHING_PROJECTIONS.STATUS, status)
                .set(APPLICATION_MATCHING_PROJECTIONS.FINAL_SCORE, java.math.BigDecimal.valueOf(finalScore))
                .set(APPLICATION_MATCHING_PROJECTIONS.QUALITY_FLAGS, JSON.json(qualityFlagsJson))
                .set(APPLICATION_MATCHING_PROJECTIONS.EXPLANATION, JSON.json(explanationJson))
                .set(APPLICATION_MATCHING_PROJECTIONS.ALGORITHM_VERSION, algorithmVersion)
                .set(APPLICATION_MATCHING_PROJECTIONS.TAXONOMY_VERSION, taxonomyVersion)
                .set(APPLICATION_MATCHING_PROJECTIONS.UPDATED_AT, OffsetDateTime.now(ZoneOffset.UTC))
                .set(APPLICATION_MATCHING_PROJECTIONS.VERSION, APPLICATION_MATCHING_PROJECTIONS.VERSION.plus(1L))
                .where(APPLICATION_MATCHING_PROJECTIONS.APPLICATION_ID.eq(applicationId)).execute() == 1;
    }

    public Optional<Projection> findForViewer(UUID applicationId, UUID viewerId) {
        return dsl.select(APPLICATION_MATCHING_PROJECTIONS.fields())
                .from(APPLICATION_MATCHING_PROJECTIONS)
                .join(APPLICATIONS).on(APPLICATIONS.PUBLIC_ID.eq(applicationId)
                        .and(APPLICATIONS.PUBLIC_ID.eq(APPLICATION_MATCHING_PROJECTIONS.APPLICATION_ID)))
                .join(JOBS).on(JOBS.ID.eq(APPLICATIONS.JOB_ID))
                .join(JOB_VERSIONS).on(JOB_VERSIONS.ID.eq(APPLICATIONS.JOB_VERSION_ID))
                .join(CVS).on(CVS.ID.eq(APPLICATIONS.CV_ID))
                .leftJoin(COMPANY_MEMBERS).on(COMPANY_MEMBERS.COMPANY_ID.eq(JOBS.COMPANY_ID)
                        .and(COMPANY_MEMBERS.USER_ID.eq(viewerId)).and(COMPANY_MEMBERS.STATUS.eq("ACTIVE")))
                .where(APPLICATION_MATCHING_PROJECTIONS.APPLICATION_ID.eq(applicationId))
                .and(JOB_VERSIONS.MATCHING_DOMAIN.eq("IT")).and(CVS.STATUS.ne("DELETED"))
                .and(APPLICATIONS.STATUS.ne("WITHDRAWN")).and(granted())
                .and(APPLICATIONS.CANDIDATE_USER_ID.eq(viewerId).or(COMPANY_MEMBERS.ID.isNotNull()))
                .fetchOptional(record -> new Projection(
                        record.get(APPLICATION_MATCHING_PROJECTIONS.APPLICATION_ID),
                        record.get(APPLICATION_MATCHING_PROJECTIONS.CV_VERSION_ID),
                        record.get(APPLICATION_MATCHING_PROJECTIONS.JOB_VERSION_ID),
                        record.get(APPLICATION_MATCHING_PROJECTIONS.MATCHING_RESULT_ID),
                        record.get(APPLICATION_MATCHING_PROJECTIONS.STATUS),
                        record.get(APPLICATION_MATCHING_PROJECTIONS.FINAL_SCORE).doubleValue(),
                        record.get(APPLICATION_MATCHING_PROJECTIONS.QUALITY_FLAGS).data(),
                        record.get(APPLICATION_MATCHING_PROJECTIONS.EXPLANATION).data(),
                        record.get(APPLICATION_MATCHING_PROJECTIONS.ALGORITHM_VERSION),
                        record.get(APPLICATION_MATCHING_PROJECTIONS.TAXONOMY_VERSION),
                        record.get(APPLICATION_MATCHING_PROJECTIONS.UPDATED_AT)));
    }

    private org.jooq.Condition granted() {
        return DSL.exists(dsl.selectOne().from(APPLICATION_CV_ACCESS_GRANTS)
                .join(CANDIDATE_CONSENTS).on(CANDIDATE_CONSENTS.ID.eq(APPLICATION_CV_ACCESS_GRANTS.CONSENT_ID))
                .where(APPLICATION_CV_ACCESS_GRANTS.APPLICATION_ID.eq(APPLICATIONS.ID))
                .and(APPLICATION_CV_ACCESS_GRANTS.CV_VERSION_ID.eq(APPLICATIONS.CV_VERSION_ID))
                .and(APPLICATION_CV_ACCESS_GRANTS.COMPANY_ID.eq(APPLICATIONS.COMPANY_ID))
                .and(CANDIDATE_CONSENTS.CANDIDATE_USER_ID.eq(APPLICATIONS.CANDIDATE_USER_ID))
                .and(CANDIDATE_CONSENTS.CONSENT_TYPE.eq("CV_SHARING"))
                .and(CANDIDATE_CONSENTS.POLICY_VERSION.eq(APPLICATIONS.CONSENT_POLICY_VERSION))
                .and(APPLICATION_CV_ACCESS_GRANTS.REVOKED_AT.isNull()).and(CANDIDATE_CONSENTS.REVOKED_AT.isNull()));
    }

    public record Projection(UUID applicationId, UUID cvVersionId, UUID jobVersionId,
                             UUID matchingResultId, String status, double finalScore,
                             String qualityFlagsJson, String explanationJson,
                             String algorithmVersion, String taxonomyVersion, OffsetDateTime updatedAt) { }
}
