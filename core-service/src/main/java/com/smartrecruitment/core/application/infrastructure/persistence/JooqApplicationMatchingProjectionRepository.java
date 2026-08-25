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

@Repository
public class JooqApplicationMatchingProjectionRepository {
    private final DSLContext dsl;

    public JooqApplicationMatchingProjectionRepository(DSLContext dsl) { this.dsl = dsl; }

    @Transactional
    public void update(UUID applicationId, UUID cvVersionId, UUID jobVersionId,
                       UUID matchingResultId, String status, double finalScore,
                       String qualityFlagsJson, String explanationJson) {
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
                    .set(APPLICATION_MATCHING_PROJECTIONS.UPDATED_AT, OffsetDateTime.now(ZoneOffset.UTC))
                    .set(APPLICATION_MATCHING_PROJECTIONS.VERSION, 0L)
                    .execute();
            return;
        }
        if (!cvVersionId.equals(current.getCvVersionId()) || !jobVersionId.equals(current.getJobVersionId())) return;
        if (matchingResultId.equals(current.getMatchingResultId())) return;
        dsl.update(APPLICATION_MATCHING_PROJECTIONS)
                .set(APPLICATION_MATCHING_PROJECTIONS.MATCHING_RESULT_ID, matchingResultId)
                .set(APPLICATION_MATCHING_PROJECTIONS.STATUS, status)
                .set(APPLICATION_MATCHING_PROJECTIONS.FINAL_SCORE, java.math.BigDecimal.valueOf(finalScore))
                .set(APPLICATION_MATCHING_PROJECTIONS.QUALITY_FLAGS, JSON.json(qualityFlagsJson))
                .set(APPLICATION_MATCHING_PROJECTIONS.EXPLANATION, JSON.json(explanationJson))
                .set(APPLICATION_MATCHING_PROJECTIONS.UPDATED_AT, OffsetDateTime.now(ZoneOffset.UTC))
                .set(APPLICATION_MATCHING_PROJECTIONS.VERSION, APPLICATION_MATCHING_PROJECTIONS.VERSION.plus(1L))
                .where(APPLICATION_MATCHING_PROJECTIONS.APPLICATION_ID.eq(applicationId)).execute();
    }

    public Optional<Projection> findForViewer(UUID applicationId, UUID viewerId) {
        return dsl.select(APPLICATION_MATCHING_PROJECTIONS.fields())
                .from(APPLICATION_MATCHING_PROJECTIONS)
                .join(APPLICATIONS).on(APPLICATIONS.PUBLIC_ID.eq(applicationId)
                        .and(APPLICATIONS.PUBLIC_ID.eq(APPLICATION_MATCHING_PROJECTIONS.APPLICATION_ID)))
                .join(JOBS).on(JOBS.ID.eq(APPLICATIONS.JOB_ID))
                .leftJoin(COMPANY_MEMBERS).on(COMPANY_MEMBERS.COMPANY_ID.eq(JOBS.COMPANY_ID)
                        .and(COMPANY_MEMBERS.USER_ID.eq(viewerId)).and(COMPANY_MEMBERS.STATUS.eq("ACTIVE")))
                .where(APPLICATION_MATCHING_PROJECTIONS.APPLICATION_ID.eq(applicationId))
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
                        record.get(APPLICATION_MATCHING_PROJECTIONS.UPDATED_AT)));
    }

    public record Projection(UUID applicationId, UUID cvVersionId, UUID jobVersionId,
                             UUID matchingResultId, String status, double finalScore,
                             String qualityFlagsJson, String explanationJson, OffsetDateTime updatedAt) { }
}
